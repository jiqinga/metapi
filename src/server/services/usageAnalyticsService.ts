import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import {
  getLocalRangeStartDayKey,
  getLocalRangeStartUtc,
  getLocalDayKeyRangeUtc,
  toLocalDayKeyFromStoredUtc,
  type StoredUtcDateTimeInput,
} from "./localTimeService.js";
import { proxyCostSqlExpression, toRoundedMicroNumber } from "./statsShared.js";
import { runUsageAggregationProjectionPass } from "./usageAggregationService.js";

export type UsageOverviewTrendPoint = {
  day: string;
  tokens: number;
  spend: number;
  calls: number;
  successCalls: number;
  promptTokens: number;
  completionTokens: number;
};

export type UsageOverviewResult = {
  trend: UsageOverviewTrendPoint[];
  totals: {
    tokens: number;
    spend: number;
    calls: number;
    successCalls: number;
    promptTokens: number;
    completionTokens: number;
  };
};

export type UsageBySiteItem = {
  siteId: number;
  siteName: string;
  platform: string | null;
  tokens: number;
  spend: number;
  calls: number;
  successCalls: number;
  avgLatencyMs: number | null;
  successRate: number;
};

export type UsageByModelItem = {
  model: string;
  tokens: number;
  spend: number;
  calls: number;
  successCalls: number;
  avgLatencyMs: number | null;
  successRate: number;
};

export type UsageByKeyItem = {
  keyId: number | null;
  keyName: string;
  tokens: number;
  spend: number;
  calls: number;
  successCalls: number;
  successRate: number;
};

export type UsageByClientItem = {
  clientName: string;
  tokens: number;
  spend: number;
  calls: number;
  successCalls: number;
  successRate: number;
};

export type UsageByAccountItem = {
  accountId: number;
  accountName: string;
  siteName: string;
  tokens: number;
  spend: number;
  calls: number;
  successCalls: number;
  successRate: number;
};

export type TokenCompositionPoint = {
  day: string;
  promptTokens: number;
  completionTokens: number;
};

export type TokenCompositionResult = {
  trend: TokenCompositionPoint[];
  totals: {
    promptTokens: number;
    completionTokens: number;
    promptRatio: number;
    completionRatio: number;
  };
};

export type UsageQueryParams = {
  /** Inclusive start day key in local time, e.g. "2026-08-20" */
  fromDay?: string;
  /** Inclusive end day key in local time, e.g. "2026-08-26" */
  toDay?: string;
  /** Optional site filter */
  siteId?: number | null;
  /** Optional model filter (matches modelActual or modelRequested) */
  model?: string | null;
};

function roundSuccessRate(success: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((success / total) * 1000) / 10;
}

function avgLatency(totalLatencyMs: number, latencyCount: number): number | null {
  if (latencyCount <= 0) return null;
  return Math.round(totalLatencyMs / latencyCount);
}

/**
 * Resolve the [sinceDay, untilDay] window (inclusive local day keys).
 * If neither is provided, defaults to last 7 days.
 * If only one is provided, uses that single day.
 */
function resolveDayRange(params: UsageQueryParams): {
  sinceDay: string;
  untilDay: string;
  dayKeys: string[];
} {
  const now = new Date();
  const todayKey = getLocalRangeStartDayKey(1, now);

  if (params.fromDay && params.toDay) {
    const since = params.fromDay < params.toDay ? params.fromDay : params.toDay;
    const until = params.fromDay < params.toDay ? params.toDay : params.fromDay;
    return { sinceDay: since, untilDay: until, dayKeys: buildDayKeyRange(since, until) };
  }

  if (params.fromDay) {
    return { sinceDay: params.fromDay, untilDay: params.fromDay, dayKeys: [params.fromDay] };
  }

  if (params.toDay) {
    return { sinceDay: params.toDay, untilDay: params.toDay, dayKeys: [params.toDay] };
  }

  // Default: last 7 days
  const since = getLocalRangeStartDayKey(7, now);
  return { sinceDay: since, untilDay: todayKey, dayKeys: buildDayKeyRange(since, todayKey) };
}

/** Build the full list of day keys from since to until (inclusive). */
function buildDayKeyRange(sinceDay: string, untilDay: string): string[] {
  const keys: string[] = [];
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sinceDay);
  if (!match) return [sinceDay];
  let cursor = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    0,
    0,
    0,
    0,
  );
  while (true) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    keys.push(key);
    if (key >= untilDay) break;
    cursor = new Date(cursor.getTime() + 86_400_000);
    // Safety limit
    if (keys.length > 366) break;
  }
  return keys;
}

/** Convert a local day key to the UTC start timestamp (for proxyLogs createdAt filtering). */
function dayKeyToUtcStart(dayKey: string): string {
  const range = getLocalDayKeyRangeUtc(dayKey);
  return range ? range.startUtc : getLocalRangeStartUtc(1);
}

/** Convert a local day key to the UTC end timestamp (inclusive day's end). */
function dayKeyToUtcEnd(dayKey: string): string {
  const range = getLocalDayKeyRangeUtc(dayKey);
  return range ? range.endUtc : getLocalRangeStartUtc(1);
}

export async function loadUsageOverview(
  params: UsageQueryParams,
): Promise<UsageOverviewResult> {
  const { sinceDay, untilDay, dayKeys } = resolveDayRange(params);
  const siteId =
    params.siteId != null && Number.isFinite(params.siteId)
      ? params.siteId
      : null;
  const model = params.model?.trim() || null;

  await runUsageAggregationProjectionPass();

  const sinceUtc = dayKeyToUtcStart(sinceDay);
  const untilUtc = dayKeyToUtcEnd(untilDay);

  // Build model filter for siteDayUsage via modelDayUsage join is not possible,
  // so for overview we read siteDayUsage for daily totals (no model filter),
  // and separately read proxyLogs for prompt/completion (with model filter if present).
  const [dayRows, tokenRows] = await Promise.all([
    (async () => {
      let query = db
        .select({
          localDay: schema.siteDayUsage.localDay,
          tokens: sql<number>`coalesce(sum(${schema.siteDayUsage.totalTokens}), 0)`,
          spend: sql<number>`coalesce(sum(${schema.siteDayUsage.totalSiteSpend}), 0)`,
          calls: sql<number>`coalesce(sum(${schema.siteDayUsage.totalCalls}), 0)`,
          successCalls: sql<number>`coalesce(sum(${schema.siteDayUsage.successCalls}), 0)`,
        })
        .from(schema.siteDayUsage)
        .where(
          and(
            gte(schema.siteDayUsage.localDay, sinceDay),
            lte(schema.siteDayUsage.localDay, untilDay),
          ),
        );
      if (siteId != null) {
        query = query.where(eq(schema.siteDayUsage.siteId, siteId)) as typeof query;
      }
      return query.groupBy(schema.siteDayUsage.localDay).all();
    })(),
    (async () => {
      let query = db
        .select({
          createdAt: schema.proxyLogs.createdAt,
          promptTokens: sql<number>`coalesce(sum(${schema.proxyLogs.promptTokens}), 0)`,
          completionTokens: sql<number>`coalesce(sum(${schema.proxyLogs.completionTokens}), 0)`,
        })
        .from(schema.proxyLogs)
        .innerJoin(
          schema.accounts,
          eq(schema.proxyLogs.accountId, schema.accounts.id),
        )
        .innerJoin(schema.sites, eq(schema.accounts.siteId, schema.sites.id))
        .where(
          and(
            gte(schema.proxyLogs.createdAt, sinceUtc),
            lte(schema.proxyLogs.createdAt, untilUtc),
          ),
        );
      if (siteId != null) {
        query = query.where(eq(schema.sites.id, siteId)) as typeof query;
      }
      if (model) {
        query = query.where(
          sql`(${schema.proxyLogs.modelActual} = ${model} OR ${schema.proxyLogs.modelRequested} = ${model})`,
        ) as typeof query;
      }
      return query.groupBy(schema.proxyLogs.createdAt).all();
    })(),
  ]);

  // Aggregate token rows by local day key
  const tokenByDay = new Map<string, { prompt: number; completion: number }>();
  for (const row of tokenRows) {
    const raw = row.createdAt as StoredUtcDateTimeInput;
    const dayKey = toLocalDayKeyFromStoredUtc(raw);
    if (!dayKey) continue;
    const agg = tokenByDay.get(dayKey) || { prompt: 0, completion: 0 };
    agg.prompt += Number(row.promptTokens || 0);
    agg.completion += Number(row.completionTokens || 0);
    tokenByDay.set(dayKey, agg);
  }

  const dayMap = new Map<string, UsageOverviewTrendPoint>();
  for (const key of dayKeys) {
    dayMap.set(key, {
      day: key,
      tokens: 0,
      spend: 0,
      calls: 0,
      successCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
    });
  }
  for (const row of dayRows) {
    const key = row.localDay;
    if (!dayMap.has(key)) continue;
    const entry = dayMap.get(key)!;
    entry.tokens += Number(row.tokens || 0);
    entry.spend += toRoundedMicroNumber(Number(row.spend || 0));
    entry.calls += Number(row.calls || 0);
    entry.successCalls += Number(row.successCalls || 0);
  }
  for (const [key, agg] of tokenByDay) {
    if (!dayMap.has(key)) continue;
    const entry = dayMap.get(key)!;
    entry.promptTokens += agg.prompt;
    entry.completionTokens += agg.completion;
  }

  const trend = Array.from(dayMap.values()).sort((a, b) =>
    a.day.localeCompare(b.day),
  );
  const totals = trend.reduce(
    (acc, point) => ({
      tokens: acc.tokens + point.tokens,
      spend: toRoundedMicroNumber(acc.spend + point.spend),
      calls: acc.calls + point.calls,
      successCalls: acc.successCalls + point.successCalls,
      promptTokens: acc.promptTokens + point.promptTokens,
      completionTokens: acc.completionTokens + point.completionTokens,
    }),
    { tokens: 0, spend: 0, calls: 0, successCalls: 0, promptTokens: 0, completionTokens: 0 },
  );

  return { trend, totals };
}

export async function loadUsageBySite(
  params: UsageQueryParams,
): Promise<{ items: UsageBySiteItem[] }> {
  const { sinceDay, untilDay } = resolveDayRange(params);
  await runUsageAggregationProjectionPass();

  const rows = await db
    .select({
      siteId: schema.siteDayUsage.siteId,
      siteName: schema.sites.name,
      platform: schema.sites.platform,
      tokens: sql<number>`coalesce(sum(${schema.siteDayUsage.totalTokens}), 0)`,
      spend: sql<number>`coalesce(sum(${schema.siteDayUsage.totalSiteSpend}), 0)`,
      calls: sql<number>`coalesce(sum(${schema.siteDayUsage.totalCalls}), 0)`,
      successCalls: sql<number>`coalesce(sum(${schema.siteDayUsage.successCalls}), 0)`,
      totalLatencyMs: sql<number>`coalesce(sum(${schema.siteDayUsage.totalLatencyMs}), 0)`,
      latencyCount: sql<number>`coalesce(sum(${schema.siteDayUsage.latencyCount}), 0)`,
    })
    .from(schema.siteDayUsage)
    .innerJoin(schema.sites, eq(schema.siteDayUsage.siteId, schema.sites.id))
    .where(
      and(
        gte(schema.siteDayUsage.localDay, sinceDay),
        lte(schema.siteDayUsage.localDay, untilDay),
      ),
    )
    .groupBy(schema.siteDayUsage.siteId, schema.sites.name, schema.sites.platform)
    .all();

  const items: UsageBySiteItem[] = rows
    .map((row: typeof rows[number]) => ({
      siteId: row.siteId,
      siteName: row.siteName || "unknown",
      platform: row.platform,
      tokens: Number(row.tokens || 0),
      spend: toRoundedMicroNumber(Number(row.spend || 0)),
      calls: Number(row.calls || 0),
      successCalls: Number(row.successCalls || 0),
      avgLatencyMs: avgLatency(
        Number(row.totalLatencyMs || 0),
        Number(row.latencyCount || 0),
      ),
      successRate: 0,
    }));
  items.sort((a: UsageBySiteItem, b: UsageBySiteItem) => b.tokens - a.tokens);

  for (const item of items) {
    item.successRate = roundSuccessRate(item.successCalls, item.calls);
  }

  return { items };
}

export async function loadUsageByModel(
  params: UsageQueryParams,
): Promise<{ items: UsageByModelItem[] }> {
  const { sinceDay, untilDay } = resolveDayRange(params);
  const siteId =
    params.siteId != null && Number.isFinite(params.siteId)
      ? params.siteId
      : null;
  const model = params.model?.trim() || null;
  await runUsageAggregationProjectionPass();

  let query = db
    .select({
      model: schema.modelDayUsage.model,
      tokens: sql<number>`coalesce(sum(${schema.modelDayUsage.totalTokens}), 0)`,
      spend: sql<number>`coalesce(sum(${schema.modelDayUsage.totalSpend}), 0)`,
      calls: sql<number>`coalesce(sum(${schema.modelDayUsage.totalCalls}), 0)`,
      successCalls: sql<number>`coalesce(sum(${schema.modelDayUsage.successCalls}), 0)`,
      totalLatencyMs: sql<number>`coalesce(sum(${schema.modelDayUsage.totalLatencyMs}), 0)`,
      latencyCount: sql<number>`coalesce(sum(${schema.modelDayUsage.latencyCount}), 0)`,
    })
    .from(schema.modelDayUsage)
    .where(
      and(
        gte(schema.modelDayUsage.localDay, sinceDay),
        lte(schema.modelDayUsage.localDay, untilDay),
      ),
    );
  if (siteId != null) {
    query = query.where(eq(schema.modelDayUsage.siteId, siteId)) as typeof query;
  }
  if (model) {
    query = query.where(eq(schema.modelDayUsage.model, model)) as typeof query;
  }
  const rows = await query.groupBy(schema.modelDayUsage.model).all();

  const items: UsageByModelItem[] = rows
    .map((row: typeof rows[number]) => ({
      model: row.model || "unknown",
      tokens: Number(row.tokens || 0),
      spend: toRoundedMicroNumber(Number(row.spend || 0)),
      calls: Number(row.calls || 0),
      successCalls: Number(row.successCalls || 0),
      avgLatencyMs: avgLatency(
        Number(row.totalLatencyMs || 0),
        Number(row.latencyCount || 0),
      ),
      successRate: 0,
    }));
  items.sort((a: UsageByModelItem, b: UsageByModelItem) => b.tokens - a.tokens);

  for (const item of items) {
    item.successRate = roundSuccessRate(item.successCalls, item.calls);
  }

  return { items };
}

/** List distinct models for a given site + date range (for the model filter dropdown). */
export async function listUsageModels(
  params: UsageQueryParams,
): Promise<{ models: string[] }> {
  const { sinceDay, untilDay } = resolveDayRange(params);
  const siteId =
    params.siteId != null && Number.isFinite(params.siteId)
      ? params.siteId
      : null;
  await runUsageAggregationProjectionPass();

  let query = db
    .select({ model: schema.modelDayUsage.model })
    .from(schema.modelDayUsage)
    .where(
      and(
        gte(schema.modelDayUsage.localDay, sinceDay),
        lte(schema.modelDayUsage.localDay, untilDay),
      ),
    );
  if (siteId != null) {
    query = query.where(eq(schema.modelDayUsage.siteId, siteId)) as typeof query;
  }
  const rows = await query.groupBy(schema.modelDayUsage.model).all();

  const models = rows
    .map((row: typeof rows[number]) => row.model || "")
    .filter((m: string) => m.length > 0)
    .sort((a: string, b: string) => a.localeCompare(b));

  return { models };
}

export async function loadUsageByKey(
  params: UsageQueryParams,
): Promise<{ items: UsageByKeyItem[] }> {
  const { sinceDay, untilDay } = resolveDayRange(params);
  const siteId =
    params.siteId != null && Number.isFinite(params.siteId)
      ? params.siteId
      : null;
  const model = params.model?.trim() || null;
  await runUsageAggregationProjectionPass();
  const sinceUtc = dayKeyToUtcStart(sinceDay);
  const untilUtc = dayKeyToUtcEnd(untilDay);

  let query = db
    .select({
      keyId: schema.proxyLogs.downstreamApiKeyId,
      keyName: schema.downstreamApiKeys.name,
      tokens: sql<number>`coalesce(sum(${schema.proxyLogs.totalTokens}), 0)`,
      spend: sql<number>`coalesce(sum(${proxyCostSqlExpression()}), 0)`,
      calls: sql<number>`count(*)`,
      successCalls: sql<number>`coalesce(sum(case when ${schema.proxyLogs.status} = 'success' then 1 else 0 end), 0)`,
    })
    .from(schema.proxyLogs)
    .innerJoin(
      schema.accounts,
      eq(schema.proxyLogs.accountId, schema.accounts.id),
    )
    .innerJoin(schema.sites, eq(schema.accounts.siteId, schema.sites.id))
    .leftJoin(
      schema.downstreamApiKeys,
      eq(schema.proxyLogs.downstreamApiKeyId, schema.downstreamApiKeys.id),
    )
    .where(
      and(
        gte(schema.proxyLogs.createdAt, sinceUtc),
        lte(schema.proxyLogs.createdAt, untilUtc),
      ),
    );
  if (siteId != null) {
    query = query.where(eq(schema.sites.id, siteId)) as typeof query;
  }
  if (model) {
    query = query.where(
      sql`(${schema.proxyLogs.modelActual} = ${model} OR ${schema.proxyLogs.modelRequested} = ${model})`,
    ) as typeof query;
  }
  const rows = await query
    .groupBy(
      schema.proxyLogs.downstreamApiKeyId,
      schema.downstreamApiKeys.name,
    )
    .all();

  const items: UsageByKeyItem[] = rows
    .map((row: typeof rows[number]) => ({
      keyId: row.keyId,
      keyName: row.keyName || (row.keyId ? `key-${row.keyId}` : "未关联"),
      tokens: Number(row.tokens || 0),
      spend: toRoundedMicroNumber(Number(row.spend || 0)),
      calls: Number(row.calls || 0),
      successCalls: Number(row.successCalls || 0),
      successRate: 0,
    }));
  items.sort((a: UsageByKeyItem, b: UsageByKeyItem) => b.tokens - a.tokens);

  for (const item of items) {
    item.successRate = roundSuccessRate(item.successCalls, item.calls);
  }

  return { items };
}

export async function loadUsageByClient(
  params: UsageQueryParams,
): Promise<{ items: UsageByClientItem[] }> {
  const { sinceDay, untilDay } = resolveDayRange(params);
  const siteId =
    params.siteId != null && Number.isFinite(params.siteId)
      ? params.siteId
      : null;
  const model = params.model?.trim() || null;
  await runUsageAggregationProjectionPass();
  const sinceUtc = dayKeyToUtcStart(sinceDay);
  const untilUtc = dayKeyToUtcEnd(untilDay);

  let query = db
    .select({
      clientAppName: schema.proxyLogs.clientAppName,
      clientFamily: schema.proxyLogs.clientFamily,
      tokens: sql<number>`coalesce(sum(${schema.proxyLogs.totalTokens}), 0)`,
      spend: sql<number>`coalesce(sum(${proxyCostSqlExpression()}), 0)`,
      calls: sql<number>`count(*)`,
      successCalls: sql<number>`coalesce(sum(case when ${schema.proxyLogs.status} = 'success' then 1 else 0 end), 0)`,
    })
    .from(schema.proxyLogs)
    .innerJoin(
      schema.accounts,
      eq(schema.proxyLogs.accountId, schema.accounts.id),
    )
    .innerJoin(schema.sites, eq(schema.accounts.siteId, schema.sites.id))
    .where(
      and(
        gte(schema.proxyLogs.createdAt, sinceUtc),
        lte(schema.proxyLogs.createdAt, untilUtc),
      ),
    );
  if (siteId != null) {
    query = query.where(eq(schema.sites.id, siteId)) as typeof query;
  }
  if (model) {
    query = query.where(
      sql`(${schema.proxyLogs.modelActual} = ${model} OR ${schema.proxyLogs.modelRequested} = ${model})`,
    ) as typeof query;
  }
  const rows = await query
    .groupBy(schema.proxyLogs.clientAppName, schema.proxyLogs.clientFamily)
    .all();

  const items: UsageByClientItem[] = rows
    .map((row: typeof rows[number]) => {
      const name =
        (row.clientAppName || "").trim() ||
        (row.clientFamily || "").trim() ||
        "未知客户端";
      return {
        clientName: name,
        tokens: Number(row.tokens || 0),
        spend: toRoundedMicroNumber(Number(row.spend || 0)),
        calls: Number(row.calls || 0),
        successCalls: Number(row.successCalls || 0),
        successRate: 0,
      };
    });
  items.sort((a: UsageByClientItem, b: UsageByClientItem) => b.tokens - a.tokens);

  for (const item of items) {
    item.successRate = roundSuccessRate(item.successCalls, item.calls);
  }

  return { items };
}

export async function loadUsageByAccount(
  params: UsageQueryParams,
): Promise<{ items: UsageByAccountItem[] }> {
  const { sinceDay, untilDay } = resolveDayRange(params);
  const siteId =
    params.siteId != null && Number.isFinite(params.siteId)
      ? params.siteId
      : null;
  const model = params.model?.trim() || null;
  await runUsageAggregationProjectionPass();
  const sinceUtc = dayKeyToUtcStart(sinceDay);
  const untilUtc = dayKeyToUtcEnd(untilDay);

  let query = db
    .select({
      accountId: schema.proxyLogs.accountId,
      accountName: schema.accounts.username,
      siteName: schema.sites.name,
      tokens: sql<number>`coalesce(sum(${schema.proxyLogs.totalTokens}), 0)`,
      spend: sql<number>`coalesce(sum(${proxyCostSqlExpression()}), 0)`,
      calls: sql<number>`count(*)`,
      successCalls: sql<number>`coalesce(sum(case when ${schema.proxyLogs.status} = 'success' then 1 else 0 end), 0)`,
    })
    .from(schema.proxyLogs)
    .innerJoin(
      schema.accounts,
      eq(schema.proxyLogs.accountId, schema.accounts.id),
    )
    .innerJoin(schema.sites, eq(schema.accounts.siteId, schema.sites.id))
    .where(
      and(
        gte(schema.proxyLogs.createdAt, sinceUtc),
        lte(schema.proxyLogs.createdAt, untilUtc),
      ),
    );
  if (siteId != null) {
    query = query.where(eq(schema.sites.id, siteId)) as typeof query;
  }
  if (model) {
    query = query.where(
      sql`(${schema.proxyLogs.modelActual} = ${model} OR ${schema.proxyLogs.modelRequested} = ${model})`,
    ) as typeof query;
  }
  const rows = await query
    .groupBy(
      schema.proxyLogs.accountId,
      schema.accounts.username,
      schema.sites.name,
    )
    .all();

  const items: UsageByAccountItem[] = rows
    .map((row: typeof rows[number]) => ({
      accountId: row.accountId ?? 0,
      accountName: row.accountName || "unknown",
      siteName: row.siteName || "unknown",
      tokens: Number(row.tokens || 0),
      spend: toRoundedMicroNumber(Number(row.spend || 0)),
      calls: Number(row.calls || 0),
      successCalls: Number(row.successCalls || 0),
      successRate: 0,
    }));
  items.sort((a: UsageByAccountItem, b: UsageByAccountItem) => b.tokens - a.tokens);

  for (const item of items) {
    item.successRate = roundSuccessRate(item.successCalls, item.calls);
  }

  return { items };
}

export async function loadTokenComposition(
  params: UsageQueryParams,
): Promise<TokenCompositionResult> {
  const { sinceDay, untilDay, dayKeys } = resolveDayRange(params);
  const siteId =
    params.siteId != null && Number.isFinite(params.siteId)
      ? params.siteId
      : null;
  const model = params.model?.trim() || null;
  await runUsageAggregationProjectionPass();
  const sinceUtc = dayKeyToUtcStart(sinceDay);
  const untilUtc = dayKeyToUtcEnd(untilDay);

  let query = db
    .select({
      createdAt: schema.proxyLogs.createdAt,
      promptTokens: sql<number>`coalesce(sum(${schema.proxyLogs.promptTokens}), 0)`,
      completionTokens: sql<number>`coalesce(sum(${schema.proxyLogs.completionTokens}), 0)`,
    })
    .from(schema.proxyLogs)
    .innerJoin(
      schema.accounts,
      eq(schema.proxyLogs.accountId, schema.accounts.id),
    )
    .innerJoin(schema.sites, eq(schema.accounts.siteId, schema.sites.id))
    .where(
      and(
        gte(schema.proxyLogs.createdAt, sinceUtc),
        lte(schema.proxyLogs.createdAt, untilUtc),
      ),
    );
  if (siteId != null) {
    query = query.where(eq(schema.sites.id, siteId)) as typeof query;
  }
  if (model) {
    query = query.where(
      sql`(${schema.proxyLogs.modelActual} = ${model} OR ${schema.proxyLogs.modelRequested} = ${model})`,
    ) as typeof query;
  }
  const rows = await query.groupBy(schema.proxyLogs.createdAt).all();

  const dayMap = new Map<string, TokenCompositionPoint>();
  for (const key of dayKeys) {
    dayMap.set(key, { day: key, promptTokens: 0, completionTokens: 0 });
  }
  for (const row of rows) {
    const raw = row.createdAt as StoredUtcDateTimeInput;
    const dayKey = toLocalDayKeyFromStoredUtc(raw);
    if (!dayKey || !dayMap.has(dayKey)) continue;
    const entry = dayMap.get(dayKey)!;
    entry.promptTokens += Number(row.promptTokens || 0);
    entry.completionTokens += Number(row.completionTokens || 0);
  }

  const trend = Array.from(dayMap.values()).sort((a, b) =>
    a.day.localeCompare(b.day),
  );
  const promptTokens = trend.reduce((s, p) => s + p.promptTokens, 0);
  const completionTokens = trend.reduce((s, p) => s + p.completionTokens, 0);
  const total = promptTokens + completionTokens;

  return {
    trend,
    totals: {
      promptTokens,
      completionTokens,
      promptRatio: total > 0 ? Math.round((promptTokens / total) * 1000) / 10 : 0,
      completionRatio: total > 0 ? Math.round((completionTokens / total) * 1000) / 10 : 0,
    },
  };
}

// Re-export for route layer convenience
export { getLocalDayKeyRangeUtc };
