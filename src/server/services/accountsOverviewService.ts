import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { config } from "../config.js";
import {
  getCredentialModeFromExtraConfig,
  hasOauthProvider,
  type AccountCredentialMode,
} from "./accountExtraConfig.js";
import {
  buildRuntimeHealthForAccount,
  type RuntimeHealthInfo,
} from "./accountHealthService.js";
import { parseCheckinRewardAmount } from "./checkinRewardParser.js";
import { getLocalDayRangeUtc, getLocalHourAnchor, getLocalHourRangeStartUtc } from "./localTimeService.js";
import {
  readSnapshotCache,
  type SnapshotEnvelope,
} from "./snapshotCacheService.js";
import { estimateRewardWithTodayIncomeFallback } from "./todayIncomeRewardService.js";
import { createAdminSnapshotPersistence } from "./adminSnapshotStore.js";
import {
  buildAccountAvailabilitySummariesFromHourlyAggregates,
  type AccountAvailabilitySummary,
} from "./statsShared.js";

export type AccountCapabilities = {
  canCheckin: boolean;
  canRefreshBalance: boolean;
  proxyOnly: boolean;
};

type AccountWithSiteRow = {
  accounts: typeof schema.accounts.$inferSelect;
  sites: typeof schema.sites.$inferSelect;
};

export type AccountOverviewRow = typeof schema.accounts.$inferSelect & {
  site: typeof schema.sites.$inferSelect;
  credentialMode: AccountCredentialMode;
  capabilities: AccountCapabilities;
  todaySpend: number;
  todayReward: number;
  runtimeHealth: RuntimeHealthInfo;
  availability: AccountAvailabilitySummary | null;
  lastCallAt: string | null;
};

export type AccountsSnapshotPayload = {
  accounts: AccountOverviewRow[];
  sites: Array<typeof schema.sites.$inferSelect>;
};

const ACCOUNTS_SNAPSHOT_TTL_MS = 15_000;
const accountsSnapshotPersistence =
  createAdminSnapshotPersistence<AccountsSnapshotPayload>({
    namespace: "accounts-snapshot",
    key: "all",
  });

function hasSessionTokenValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function resolveStoredCredentialMode(
  account: typeof schema.accounts.$inferSelect,
): AccountCredentialMode {
  const fromConfig = getCredentialModeFromExtraConfig(account.extraConfig);
  if (fromConfig && fromConfig !== "auto") return fromConfig;
  return hasSessionTokenValue(account.accessToken) ? "session" : "apikey";
}

function buildCapabilitiesFromCredentialMode(
  credentialMode: AccountCredentialMode,
  hasSessionToken: boolean,
  oauthIdentity?:
    | string
    | null
    | Pick<
        typeof schema.accounts.$inferSelect,
        "extraConfig" | "oauthProvider"
      >,
): AccountCapabilities {
  if (hasOauthProvider(oauthIdentity)) {
    return {
      canCheckin: false,
      canRefreshBalance: false,
      proxyOnly: true,
    };
  }
  const sessionCapable =
    credentialMode === "session"
      ? hasSessionToken
      : credentialMode === "apikey"
        ? false
        : hasSessionToken;
  return {
    canCheckin: sessionCapable,
    canRefreshBalance: sessionCapable,
    proxyOnly: !sessionCapable,
  };
}

function buildCapabilitiesForAccount(
  account: typeof schema.accounts.$inferSelect,
): AccountCapabilities {
  const credentialMode = resolveStoredCredentialMode(account);
  return buildCapabilitiesFromCredentialMode(
    credentialMode,
    hasSessionTokenValue(account.accessToken),
    account,
  );
}

async function loadAccountsSnapshotPayload(): Promise<AccountsSnapshotPayload> {
  const [rows, sites] = await Promise.all([
    db
      .select()
      .from(schema.accounts)
      .innerJoin(schema.sites, eq(schema.accounts.siteId, schema.sites.id))
      .all(),
    db.select().from(schema.sites).all(),
  ]);

  const { localDay, startUtc, endUtc } = getLocalDayRangeUtc();

  const availabilityNow = getLocalHourAnchor();
  const availabilitySinceUtc = getLocalHourRangeStartUtc(config.accountAvailabilityWindowHours, availabilityNow);

  const [todaySpendRows, modelCountRows, todayCheckins, accountHourUsageRows, lastCallRows] = await Promise.all([
    db
      .select({
        accountId: schema.proxyLogs.accountId,
        totalSpend: sql<number>`coalesce(sum(${schema.proxyLogs.estimatedCost}), 0)`,
      })
      .from(schema.proxyLogs)
      .where(
        and(
          gte(schema.proxyLogs.createdAt, startUtc),
          lt(schema.proxyLogs.createdAt, endUtc),
        ),
      )
      .groupBy(schema.proxyLogs.accountId)
      .all(),
    db
      .select({
        accountId: schema.modelAvailability.accountId,
        modelCount: sql<number>`count(*)`,
      })
      .from(schema.modelAvailability)
      .where(eq(schema.modelAvailability.available, true))
      .groupBy(schema.modelAvailability.accountId)
      .all(),
    db
      .select({
        accountId: schema.checkinLogs.accountId,
        reward: schema.checkinLogs.reward,
        message: schema.checkinLogs.message,
      })
      .from(schema.checkinLogs)
      .where(
        and(
          gte(schema.checkinLogs.createdAt, startUtc),
          lt(schema.checkinLogs.createdAt, endUtc),
          eq(schema.checkinLogs.status, "success"),
        ),
      )
      .all(),
    db
      .select({
        accountId: schema.accountHourUsage.accountId,
        hourStartUtc: schema.accountHourUsage.bucketStartUtc,
        totalRequests: schema.accountHourUsage.totalCalls,
        successCount: schema.accountHourUsage.successCalls,
        failedCount: schema.accountHourUsage.failedCalls,
        totalLatencyMs: schema.accountHourUsage.totalLatencyMs,
        latencyCount: schema.accountHourUsage.latencyCount,
      })
      .from(schema.accountHourUsage)
      .where(gte(schema.accountHourUsage.bucketStartUtc, availabilitySinceUtc))
      .all(),
    db
      .select({
        accountId: schema.proxyLogs.accountId,
        lastCallAt: sql<string>`max(${schema.proxyLogs.createdAt})`,
      })
      .from(schema.proxyLogs)
      .where(sql`${schema.proxyLogs.accountId} is not null`)
      .groupBy(schema.proxyLogs.accountId)
      .all(),
  ]);

  const spendByAccount: Record<number, number> = {};
  for (const row of todaySpendRows) {
    if (row.accountId == null) continue;
    spendByAccount[row.accountId] = Number(row.totalSpend || 0);
  }

  const modelCountByAccount: Record<number, number> = {};
  for (const row of modelCountRows) {
    if (row.accountId == null) continue;
    modelCountByAccount[row.accountId] = Number(row.modelCount || 0);
  }

  const rewardByAccount: Record<number, number> = {};
  const successCountByAccount: Record<number, number> = {};
  const parsedRewardCountByAccount: Record<number, number> = {};
  for (const log of todayCheckins) {
    successCountByAccount[log.accountId] =
      (successCountByAccount[log.accountId] || 0) + 1;
    const rewardNum =
      parseCheckinRewardAmount(log.reward) ||
      parseCheckinRewardAmount(log.message);
    if (rewardNum <= 0) continue;
    rewardByAccount[log.accountId] =
      (rewardByAccount[log.accountId] || 0) + rewardNum;
    parsedRewardCountByAccount[log.accountId] =
      (parsedRewardCountByAccount[log.accountId] || 0) + 1;
  }

  const lastCallByAccount: Record<number, string> = {};
  for (const row of lastCallRows) {
    if (row.accountId == null) continue;
    const value = String(row.lastCallAt || "").trim();
    if (value) lastCallByAccount[row.accountId] = value;
  }

  const accountIds = rows.map((row: AccountWithSiteRow) => row.accounts.id);
  const availabilityByAccount = buildAccountAvailabilitySummariesFromHourlyAggregates(
    accountIds,
    accountHourUsageRows,
    availabilityNow,
  );

  return {
    accounts: rows.map((row: AccountWithSiteRow) => {
      const credentialMode = resolveStoredCredentialMode(row.accounts);
      const capabilities = buildCapabilitiesForAccount(row.accounts);
      return {
        ...row.accounts,
        site: row.sites,
        credentialMode,
        capabilities,
        todaySpend:
          Math.round((spendByAccount[row.accounts.id] || 0) * 1_000_000) /
          1_000_000,
        todayReward:
          Math.round(
            estimateRewardWithTodayIncomeFallback({
              day: localDay,
              successCount: successCountByAccount[row.accounts.id] || 0,
              parsedRewardCount:
                parsedRewardCountByAccount[row.accounts.id] || 0,
              rewardSum: rewardByAccount[row.accounts.id] || 0,
              extraConfig: row.accounts.extraConfig,
            }) * 1_000_000,
          ) / 1_000_000,
        runtimeHealth: buildRuntimeHealthForAccount({
          accountStatus: row.accounts.status,
          siteStatus: row.sites.status,
          extraConfig: row.accounts.extraConfig,
          sessionCapable: capabilities.canRefreshBalance,
          hasDiscoveredModels: (modelCountByAccount[row.accounts.id] || 0) > 0,
        }),
        availability: availabilityByAccount.get(row.accounts.id) || null,
        lastCallAt: lastCallByAccount[row.accounts.id] || null,
      };
    }),
    sites,
  };
}

export async function getAccountsSnapshot(options?: {
  forceRefresh?: boolean;
}): Promise<SnapshotEnvelope<AccountsSnapshotPayload>> {
  return readSnapshotCache({
    namespace: "accounts-snapshot",
    key: "all",
    ttlMs: ACCOUNTS_SNAPSHOT_TTL_MS,
    forceRefresh: options?.forceRefresh,
    persistence: accountsSnapshotPersistence,
    loader: loadAccountsSnapshotPayload,
  });
}

export type AccountModelUsageRow = {
  model: string;
  totalRequests: number;
  successCount: number;
  failedCount: number;
  availabilityPercent: number | null;
  averageLatencyMs: number | null;
  lastCallAt: string | null;
  totalTokens: number;
  totalSpend: number;
};

export type AccountModelUsageResult = {
  accountId: number;
  windowHours: number;
  windowStartUtc: string;
  models: AccountModelUsageRow[];
};

type ModelUsageAccumulator = {
  model: string;
  totalRequests: number;
  successCount: number;
  failedCount: number;
  latencyTotalMs: number;
  latencyCount: number;
  lastCallAt: string | null;
  totalTokens: number;
  totalSpend: number;
};

export async function loadAccountModelUsage(
  accountId: number,
  hours?: number,
): Promise<AccountModelUsageResult> {
  const windowHours = Math.max(
    1,
    Math.trunc(
      Number(hours || config.accountAvailabilityWindowHours) ||
        config.accountAvailabilityWindowHours,
    ),
  );
  const sinceUtc = getLocalHourRangeStartUtc(windowHours);

  const rows = await db
    .select({
      modelActual: schema.proxyLogs.modelActual,
      modelRequested: schema.proxyLogs.modelRequested,
      total: sql<number>`count(*)`,
      successCount: sql<number>`coalesce(sum(case when ${schema.proxyLogs.status} = 'success' then 1 else 0 end), 0)`,
      failedCount: sql<number>`coalesce(sum(case when ${schema.proxyLogs.status} is null or ${schema.proxyLogs.status} <> 'success' then 1 else 0 end), 0)`,
      totalLatencyMs: sql<number>`coalesce(sum(${schema.proxyLogs.latencyMs}), 0)`,
      latencyCount: sql<number>`sum(case when ${schema.proxyLogs.latencyMs} > 0 then 1 else 0 end)`,
      lastCallAt: sql<string | null>`max(${schema.proxyLogs.createdAt})`,
      totalTokens: sql<number>`coalesce(sum(${schema.proxyLogs.totalTokens}), 0)`,
      totalSpend: sql<number>`coalesce(sum(${schema.proxyLogs.estimatedCost}), 0)`,
    })
    .from(schema.proxyLogs)
    .where(
      and(
        eq(schema.proxyLogs.accountId, accountId),
        gte(schema.proxyLogs.createdAt, sinceUtc),
      ),
    )
    .groupBy(schema.proxyLogs.modelActual, schema.proxyLogs.modelRequested)
    .all();

  const byModel = new Map<string, ModelUsageAccumulator>();
  for (const row of rows) {
    const model =
      String(row.modelActual || row.modelRequested || "unknown").trim() ||
      "unknown";
    const total = Math.max(0, Number(row.total || 0));
    const successCount = Math.max(0, Number(row.successCount || 0));
    const failedCount = Math.max(0, Number(row.failedCount || 0));
    const totalLatencyMs = Math.max(0, Number(row.totalLatencyMs || 0));
    const latencyCount = Math.max(0, Number(row.latencyCount || 0));
    const totalTokens = Math.max(0, Number(row.totalTokens || 0));
    const totalSpend = Math.max(0, Number(row.totalSpend || 0));
    const lastCallAtRaw = row.lastCallAt;
    const lastCallAt =
      typeof lastCallAtRaw === "string" && lastCallAtRaw.trim().length > 0
        ? lastCallAtRaw
        : null;

    const existing = byModel.get(model);
    if (existing) {
      existing.totalRequests += total;
      existing.successCount += successCount;
      existing.failedCount += failedCount;
      existing.latencyTotalMs += totalLatencyMs;
      existing.latencyCount += latencyCount;
      existing.totalTokens += totalTokens;
      existing.totalSpend += totalSpend;
      if (lastCallAt && (!existing.lastCallAt || lastCallAt > existing.lastCallAt)) {
        existing.lastCallAt = lastCallAt;
      }
    } else {
      byModel.set(model, {
        model,
        totalRequests: total,
        successCount,
        failedCount,
        latencyTotalMs: totalLatencyMs,
        latencyCount,
        lastCallAt,
        totalTokens,
        totalSpend,
      });
    }
  }

  const models: AccountModelUsageRow[] = Array.from(byModel.values()).map(
    (row) => {
      const availabilityPercent =
        row.totalRequests > 0
          ? Math.round((row.successCount / row.totalRequests) * 1000) / 10
          : null;
      const averageLatencyMs =
        row.latencyCount > 0
          ? Math.round(row.latencyTotalMs / row.latencyCount)
          : null;
      return {
        model: row.model,
        totalRequests: row.totalRequests,
        successCount: row.successCount,
        failedCount: row.failedCount,
        availabilityPercent,
        averageLatencyMs,
        lastCallAt: row.lastCallAt,
        totalTokens: row.totalTokens,
        totalSpend: row.totalSpend,
      };
    },
  );

  models.sort(
    (a, b) => b.totalRequests - a.totalRequests || a.model.localeCompare(b.model),
  );

  return {
    accountId,
    windowHours,
    windowStartUtc: sinceUtc,
    models,
  };
}
