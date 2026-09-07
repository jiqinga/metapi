import { db, schema } from '../db/index.js';
import { and, eq, inArray } from 'drizzle-orm';
import { analyzePrimarySiteUrl } from '../../shared/sitePrimaryUrl.js';

type SiteRow = typeof schema.sites.$inferSelect;
type SiteApiEndpointRow = typeof schema.siteApiEndpoints.$inferSelect;
type AccountRow = typeof schema.accounts.$inferSelect;
type AccountTokenRow = typeof schema.accountTokens.$inferSelect;

const SITE_TRANSFER_VERSION = '1.1';

export interface SiteExportData {
  version: string;
  type: 'sites';
  timestamp: number;
  sites: SiteExportRow[];
  siteApiEndpoints: SiteExportApiEndpointRow[];
  siteDisabledModels: SiteExportDisabledModelRow[];
  accounts?: SiteExportAccountRow[];
  accountTokens?: SiteExportAccountTokenRow[];
}

interface SiteExportRow {
  name: string;
  url: string;
  platform: string;
  externalCheckinUrl: string | null;
  proxyUrl: string | null;
  useSystemProxy: boolean;
  customHeaders: string | null;
  customHeadersOverrideRequestHeaders: boolean;
  status: string;
  isPinned: boolean;
  sortOrder: number;
  globalWeight: number;
  postRefreshProbeEnabled: boolean;
  postRefreshProbeModel: string;
  postRefreshProbeScope: string;
  postRefreshProbeLatencyThresholdMs: number;
}

interface SiteExportApiEndpointRow {
  siteIndex: number;
  url: string;
  enabled: boolean;
  sortOrder: number;
}

interface SiteExportDisabledModelRow {
  siteIndex: number;
  modelName: string;
}

interface SiteExportAccountRow {
  siteIndex: number;
  username: string | null;
  accessToken: string;
  apiToken: string | null;
  balance: number;
  quota: number;
  unitCost: number | null;
  valueScore: number;
  status: string;
  isPinned: boolean;
  sortOrder: number;
  checkinEnabled: boolean;
  oauthProvider: string | null;
  oauthAccountKey: string | null;
  oauthProjectId: string | null;
  extraConfig: string | null;
}

interface SiteExportAccountTokenRow {
  accountIndex: number;
  name: string;
  token: string;
  tokenGroup: string | null;
  valueStatus: string;
  source: string;
  enabled: boolean;
  isDefault: boolean;
}

export interface SiteImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  details: Array<{ name: string; platform: string; url: string; action: 'created' | 'updated' | 'skipped' }>;
}

export interface SiteImportPreviewFieldDiff {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface SiteImportPreviewItem {
  name: string;
  platform: string;
  url: string;
  action: 'created' | 'updated' | 'no-change' | 'error';
  message?: string;
  diffs?: SiteImportPreviewFieldDiff[];
  endpointsBefore: number;
  endpointsAfter: number;
  disabledModelsBefore: number;
  disabledModelsAfter: number;
  connectionsBefore: number;
  connectionsAfter: number;
  tokensBefore: number;
  tokensAfter: number;
}

export interface SiteImportPreview {
  items: SiteImportPreviewItem[];
  connectionsCount: number;
  tokensCount: number;
  createdCount: number;
  updatedCount: number;
  noChangeCount: number;
  errorCount: number;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportSites(siteIds?: number[], includeConnections = false): Promise<SiteExportData> {
  const whereClause = siteIds && siteIds.length > 0
    ? inArray(schema.sites.id, siteIds)
    : undefined;

  const siteRows = whereClause
    ? await db.select().from(schema.sites).where(whereClause).orderBy(schema.sites.id).all()
    : await db.select().from(schema.sites).orderBy(schema.sites.id).all();

  if (siteRows.length === 0) {
    return {
      version: SITE_TRANSFER_VERSION,
      type: 'sites',
      timestamp: Date.now(),
      sites: [],
      siteApiEndpoints: [],
      siteDisabledModels: [],
    };
  }

  const siteIdToIndex = new Map<number, number>();
  siteRows.forEach((row: SiteRow, index: number) => siteIdToIndex.set(row.id, index));

  const siteIdList = siteRows.map((row: SiteRow) => row.id);

  const [endpointRows, disabledModelRows, accountRows] = await Promise.all([
    db.select().from(schema.siteApiEndpoints)
      .where(inArray(schema.siteApiEndpoints.siteId, siteIdList))
      .orderBy(schema.siteApiEndpoints.siteId, schema.siteApiEndpoints.sortOrder, schema.siteApiEndpoints.id)
      .all(),
    db.select().from(schema.siteDisabledModels)
      .where(inArray(schema.siteDisabledModels.siteId, siteIdList))
      .orderBy(schema.siteDisabledModels.siteId, schema.siteDisabledModels.modelName)
      .all(),
    includeConnections
      ? db.select().from(schema.accounts)
          .where(inArray(schema.accounts.siteId, siteIdList))
          .orderBy(schema.accounts.siteId, schema.accounts.id)
          .all()
      : Promise.resolve([] as AccountRow[]),
  ]);

  const exportData: SiteExportData = {
    version: SITE_TRANSFER_VERSION,
    type: 'sites',
    timestamp: Date.now(),
    sites: siteRows.map((row: SiteRow) => toExportRow(row)),
    siteApiEndpoints: endpointRows
      .map((row: SiteApiEndpointRow) => toExportEndpointRow(row, siteIdToIndex))
      .filter((row: SiteExportApiEndpointRow | null): row is SiteExportApiEndpointRow => row !== null),
    siteDisabledModels: disabledModelRows
      .map((row: typeof schema.siteDisabledModels.$inferSelect) => toExportDisabledModelRow(row, siteIdToIndex))
      .filter((row: SiteExportDisabledModelRow | null): row is SiteExportDisabledModelRow => row !== null),
  };

  if (includeConnections && accountRows.length > 0) {
    const accountIdToIndex = new Map<number, number>();
    accountRows.forEach((row: AccountRow, index: number) => accountIdToIndex.set(row.id, index));

    const accountIds = accountRows.map((row: AccountRow) => row.id);
    const tokenRows = await db.select().from(schema.accountTokens)
      .where(inArray(schema.accountTokens.accountId, accountIds))
      .orderBy(schema.accountTokens.accountId, schema.accountTokens.id)
      .all();

    exportData.accounts = accountRows
      .map((row: AccountRow) => toExportAccountRow(row, siteIdToIndex))
      .filter((row: SiteExportAccountRow | null): row is SiteExportAccountRow => row !== null);
    exportData.accountTokens = tokenRows
      .map((row: AccountTokenRow) => toExportAccountTokenRow(row, accountIdToIndex))
      .filter((row: SiteExportAccountTokenRow | null): row is SiteExportAccountTokenRow => row !== null);
  }

  return exportData;
}

function toExportRow(row: SiteRow): SiteExportRow {
  return {
    name: row.name,
    url: row.url,
    platform: row.platform,
    externalCheckinUrl: row.externalCheckinUrl ?? null,
    proxyUrl: row.proxyUrl ?? null,
    useSystemProxy: row.useSystemProxy ?? false,
    customHeaders: row.customHeaders ?? null,
    customHeadersOverrideRequestHeaders: row.customHeadersOverrideRequestHeaders ?? false,
    status: row.status ?? 'active',
    isPinned: row.isPinned ?? false,
    sortOrder: row.sortOrder ?? 0,
    globalWeight: row.globalWeight ?? 1,
    postRefreshProbeEnabled: row.postRefreshProbeEnabled ?? false,
    postRefreshProbeModel: row.postRefreshProbeModel ?? '',
    postRefreshProbeScope: row.postRefreshProbeScope ?? 'single',
    postRefreshProbeLatencyThresholdMs: row.postRefreshProbeLatencyThresholdMs ?? 0,
  };
}

function toExportEndpointRow(
  row: SiteApiEndpointRow,
  siteIdToIndex: Map<number, number>,
): SiteExportApiEndpointRow | null {
  const siteIndex = siteIdToIndex.get(row.siteId);
  if (siteIndex === undefined) return null;
  return {
    siteIndex,
    url: row.url,
    enabled: row.enabled ?? true,
    sortOrder: row.sortOrder ?? 0,
  };
}

function toExportDisabledModelRow(
  row: typeof schema.siteDisabledModels.$inferSelect,
  siteIdToIndex: Map<number, number>,
): SiteExportDisabledModelRow | null {
  const siteIndex = siteIdToIndex.get(row.siteId);
  if (siteIndex === undefined) return null;
  return {
    siteIndex,
    modelName: row.modelName,
  };
}

function toExportAccountRow(
  row: AccountRow,
  siteIdToIndex: Map<number, number>,
): SiteExportAccountRow | null {
  const siteIndex = siteIdToIndex.get(row.siteId);
  if (siteIndex === undefined) return null;
  return {
    siteIndex,
    username: row.username ?? null,
    accessToken: row.accessToken,
    apiToken: row.apiToken ?? null,
    balance: row.balance ?? 0,
    quota: row.quota ?? 0,
    unitCost: row.unitCost ?? null,
    valueScore: row.valueScore ?? 0,
    status: row.status ?? 'active',
    isPinned: row.isPinned ?? false,
    sortOrder: row.sortOrder ?? 0,
    checkinEnabled: row.checkinEnabled ?? true,
    oauthProvider: row.oauthProvider ?? null,
    oauthAccountKey: row.oauthAccountKey ?? null,
    oauthProjectId: row.oauthProjectId ?? null,
    extraConfig: row.extraConfig ?? null,
  };
}

function toExportAccountTokenRow(
  row: AccountTokenRow,
  accountIdToIndex: Map<number, number>,
): SiteExportAccountTokenRow | null {
  const accountIndex = accountIdToIndex.get(row.accountId);
  if (accountIndex === undefined) return null;
  return {
    accountIndex,
    name: row.name,
    token: row.token,
    tokenGroup: row.tokenGroup ?? null,
    valueStatus: row.valueStatus ?? 'ready',
    source: row.source ?? 'manual',
    enabled: row.enabled ?? true,
    isDefault: row.isDefault ?? false,
  };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

interface ParsedImportData {
  sites: Record<string, unknown>[];
  siteApiEndpoints: Record<string, unknown>[];
  siteDisabledModels: Record<string, unknown>[];
  accounts: Record<string, unknown>[];
  accountTokens: Record<string, unknown>[];
}

export async function importSites(data: unknown): Promise<SiteImportResult> {
  const parsed = parseImportData(data);

  if (parsed.sites.length === 0) {
    return { created: 0, updated: 0, skipped: 0, errors: [], details: [] };
  }

  const result: SiteImportResult = { created: 0, updated: 0, skipped: 0, errors: [], details: [] };

  for (let i = 0; i < parsed.sites.length; i++) {
    try {
      const outcome = await importOneSite(
        parsed.sites[i] as Record<string, unknown>,
        i,
        parsed.siteApiEndpoints,
        parsed.siteDisabledModels,
        parsed.accounts,
        parsed.accountTokens,
      );
      if (outcome === 'created') result.created++;
      else if (outcome === 'updated') result.updated++;
      else result.skipped++;
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
      result.skipped++;
    }
  }

  return result;
}

const SITE_FIELD_LABELS: Record<string, string> = {
  name: '名称',
  externalCheckinUrl: '外部签到 URL',
  proxyUrl: '代理地址',
  useSystemProxy: '使用系统代理',
  customHeaders: '自定义请求头',
  customHeadersOverrideRequestHeaders: '请求头覆盖模式',
  status: '状态',
  isPinned: '置顶',
  sortOrder: '排序',
  globalWeight: '权重',
  postRefreshProbeEnabled: '刷新后探测',
  postRefreshProbeModel: '探测模型',
  postRefreshProbeScope: '探测范围',
  postRefreshProbeLatencyThresholdMs: '延迟阈值',
};

function formatDiffValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value.trim() || '—';
  return String(value);
}

function computeSiteDiffs(
  existing: SiteRow,
  imported: Record<string, unknown>,
): SiteImportPreviewFieldDiff[] {
  const diffs: SiteImportPreviewFieldDiff[] = [];
  const fieldsToCompare = Object.keys(SITE_FIELD_LABELS);

  for (const field of fieldsToCompare) {
    const label = SITE_FIELD_LABELS[field];
    const before = formatDiffValue(field, (existing as Record<string, unknown>)[field]);
    let afterRaw: unknown = imported[field];
    // For 'updated' sites, imported data may omit fields — only diff fields present in import data
    if (afterRaw === undefined) continue;
    const after = formatDiffValue(field, afterRaw);
    if (before !== after) {
      diffs.push({ field, label, before, after });
    }
  }
  return diffs;
}

export async function previewSiteImport(data: unknown): Promise<SiteImportPreview> {
  const parsed = parseImportData(data);

  const items: SiteImportPreviewItem[] = [];
  let createdCount = 0;
  let updatedCount = 0;
  let noChangeCount = 0;
  let errorCount = 0;

  for (let i = 0; i < parsed.sites.length; i++) {
    const siteData = parsed.sites[i] as Record<string, unknown>;
    const name = asString(siteData.name);
    const rawUrl = asString(siteData.url);
    const platform = asString(siteData.platform);

    if (!name || !rawUrl) {
      items.push({
        name: name || '(未命名)',
        platform: platform || '-',
        url: rawUrl || '-',
        action: 'error',
        message: `站点 #${i + 1} 缺少必填字段 name 或 url`,
        endpointsBefore: 0, endpointsAfter: 0,
        disabledModelsBefore: 0, disabledModelsAfter: 0,
        connectionsBefore: 0, connectionsAfter: 0,
        tokensBefore: 0, tokensAfter: 0,
      });
      errorCount++;
      continue;
    }

    const analyzed = analyzePrimarySiteUrl(rawUrl);
    const canonicalUrl = analyzed.persistedUrl;
    const canonicalPlatform = platform || 'openai';

    const existing = await db.select().from(schema.sites)
      .where(and(eq(schema.sites.platform, canonicalPlatform), eq(schema.sites.url, canonicalUrl)))
      .get();

    // Count child rows before/after
    const endpointsForSite = parsed.siteApiEndpoints.filter((row) => asInt(row.siteIndex, -1) === i);
    const disabledForSite = parsed.siteDisabledModels.filter((row) => asInt(row.siteIndex, -1) === i);
    const accountsForSite = parsed.accounts.filter((row) => asInt(row.siteIndex, -1) === i);
    const accountIndicesForSite = accountsForSite.map((_, idx) => idx);
    const tokensForSite = parsed.accountTokens.filter((row) => {
      const idx = asInt(row.accountIndex, -1);
      return accountIndicesForSite.includes(idx);
    });

    let endpointsBefore = 0;
    let disabledBefore = 0;
    let connectionsBefore = 0;
    let tokensBefore = 0;

    if (existing) {
      endpointsBefore = (await db.select().from(schema.siteApiEndpoints)
        .where(eq(schema.siteApiEndpoints.siteId, existing.id)).all()).length;
      disabledBefore = (await db.select().from(schema.siteDisabledModels)
        .where(eq(schema.siteDisabledModels.siteId, existing.id)).all()).length;
      connectionsBefore = (await db.select().from(schema.accounts)
        .where(eq(schema.accounts.siteId, existing.id)).all()).length;
      const existingAccountIds = (await db.select({ id: schema.accounts.id }).from(schema.accounts)
        .where(eq(schema.accounts.siteId, existing.id)).all()).map((r: { id: number }) => r.id);
      if (existingAccountIds.length > 0) {
        tokensBefore = (await db.select().from(schema.accountTokens)
          .where(inArray(schema.accountTokens.accountId, existingAccountIds)).all()).length;
      }
    }

    // For 'updated' sites, import replaces endpoints/disabledModels, and merges connections
    const endpointsAfter = endpointsForSite.length;
    const disabledAfter = disabledForSite.length;
    // Check which imported connections are new vs existing (by accessToken)
    let newConnections = 0;
    for (const acc of accountsForSite) {
      const token = asString(acc.accessToken);
      if (!token) continue;
      if (existing) {
        const exists = await db.select().from(schema.accounts)
          .where(and(eq(schema.accounts.siteId, existing.id), eq(schema.accounts.accessToken, token))).get();
        if (!exists) newConnections++;
      } else {
        newConnections++;
      }
    }
    const connectionsAfter = connectionsBefore + newConnections;
    const tokensAfter = tokensBefore + tokensForSite.length;

    let diffs: SiteImportPreviewFieldDiff[] | undefined;
    let action: 'created' | 'updated' | 'no-change';

    if (existing) {
      diffs = computeSiteDiffs(existing, siteData);
      const hasChanges =
        (diffs && diffs.length > 0) ||
        endpointsBefore !== endpointsAfter ||
        disabledBefore !== disabledAfter ||
        connectionsBefore !== connectionsAfter ||
        tokensBefore !== tokensAfter;
      action = hasChanges ? 'updated' : 'no-change';
    } else {
      action = 'created';
    }

    items.push({
      name,
      platform: canonicalPlatform,
      url: canonicalUrl,
      action,
      diffs,
      endpointsBefore,
      endpointsAfter,
      disabledModelsBefore: disabledBefore,
      disabledModelsAfter: disabledAfter,
      connectionsBefore,
      connectionsAfter,
      tokensBefore,
      tokensAfter,
    });

    if (action === 'created') createdCount++;
    else if (action === 'updated') updatedCount++;
    else if (action === 'no-change') noChangeCount++;
  }

  return {
    items,
    connectionsCount: parsed.accounts.length,
    tokensCount: parsed.accountTokens.length,
    createdCount,
    updatedCount,
    noChangeCount,
    errorCount,
  };
}

function parseImportData(data: unknown): ParsedImportData {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('导入数据格式错误：必须为 JSON 对象');
  }

  const obj = data as Record<string, unknown>;

  // Support two formats:
  // 1. Direct: { sites: [...] }
  // 2. Full backup: { accounts: { sites: [...] } }
  const accountsSection = typeof obj.accounts === 'object' && !Array.isArray(obj.accounts)
    ? obj.accounts as Record<string, unknown>
    : null;

  const sitesRaw = Array.isArray(obj.sites) ? obj.sites
    : accountsSection && Array.isArray(accountsSection.sites) ? accountsSection.sites
    : [];

  const endpointsRaw = Array.isArray(obj.siteApiEndpoints) ? obj.siteApiEndpoints
    : accountsSection && Array.isArray(accountsSection.siteApiEndpoints) ? accountsSection.siteApiEndpoints
    : [];

  const disabledModelsRaw = Array.isArray(obj.siteDisabledModels) ? obj.siteDisabledModels
    : accountsSection && Array.isArray(accountsSection.siteDisabledModels) ? accountsSection.siteDisabledModels
    : [];

  const accountsRaw = Array.isArray(obj.accounts) && obj.accounts.length > 0 && typeof obj.accounts[0] === 'object' && !Array.isArray(obj.accounts[0])
    ? obj.accounts
    : accountsSection && Array.isArray(accountsSection.accounts) ? accountsSection.accounts
    : [];

  const accountTokensRaw = Array.isArray(obj.accountTokens) ? obj.accountTokens
    : accountsSection && Array.isArray(accountsSection.accountTokens) ? accountsSection.accountTokens
    : [];

  const sitesFiltered = sitesRaw.filter(isRecord);
  const endpointsFiltered = endpointsRaw.filter(isRecord);
  const disabledFiltered = disabledModelsRaw.filter(isRecord);
  const accountsFiltered = accountsRaw.filter(isRecord);
  const tokensFiltered = accountTokensRaw.filter(isRecord);

  // In full backup format, accounts/tokens use `siteId`/`accountId` (original DB ids)
  // instead of `siteIndex`/`accountIndex` (0-based array position). Remap them.
  const remappedAccounts = remapAccountsToSiteIndex(accountsFiltered, sitesFiltered);
  const remappedTokens = remapTokensToAccountIndex(tokensFiltered, remappedAccounts, accountsFiltered);

  return {
    sites: sitesFiltered,
    siteApiEndpoints: remapEndpointsToSiteIndex(endpointsFiltered, sitesFiltered),
    siteDisabledModels: remapDisabledModelsToSiteIndex(disabledFiltered, sitesFiltered),
    accounts: remappedAccounts,
    accountTokens: remappedTokens,
  };
}

function remapEndpointsToSiteIndex(
  endpoints: Record<string, unknown>[],
  sites: Record<string, unknown>[],
): Record<string, unknown>[] {
  // If endpoints already use siteIndex, no remap needed.
  if (endpoints.length > 0 && 'siteIndex' in endpoints[0]) return endpoints;
  // Full backup uses siteId — build original siteId → siteIndex map
  const siteIdToIndex = new Map<number, number>();
  sites.forEach((site, index) => {
    const id = asInt(site.id, -1);
    if (id >= 0) siteIdToIndex.set(id, index);
  });
  if (siteIdToIndex.size === 0) return endpoints;
  return endpoints.map((ep) => {
    const siteId = asInt(ep.siteId, -1);
    const siteIndex = siteIdToIndex.get(siteId);
    if (siteIndex === undefined) return ep;
    const { siteId: _siteId, ...rest } = ep;
    return { ...rest, siteIndex };
  });
}

function remapDisabledModelsToSiteIndex(
  models: Record<string, unknown>[],
  sites: Record<string, unknown>[],
): Record<string, unknown>[] {
  if (models.length > 0 && 'siteIndex' in models[0]) return models;
  const siteIdToIndex = new Map<number, number>();
  sites.forEach((site, index) => {
    const id = asInt(site.id, -1);
    if (id >= 0) siteIdToIndex.set(id, index);
  });
  if (siteIdToIndex.size === 0) return models;
  return models.map((dm) => {
    const siteId = asInt(dm.siteId, -1);
    const siteIndex = siteIdToIndex.get(siteId);
    if (siteIndex === undefined) return dm;
    const { siteId: _siteId, ...rest } = dm;
    return { ...rest, siteIndex };
  });
}

function remapAccountsToSiteIndex(
  accounts: Record<string, unknown>[],
  sites: Record<string, unknown>[],
): Record<string, unknown>[] {
  if (accounts.length > 0 && 'siteIndex' in accounts[0]) return accounts;
  const siteIdToIndex = new Map<number, number>();
  sites.forEach((site, index) => {
    const id = asInt(site.id, -1);
    if (id >= 0) siteIdToIndex.set(id, index);
  });
  if (siteIdToIndex.size === 0) return accounts;
  return accounts.map((acc) => {
    const siteId = asInt(acc.siteId, -1);
    const siteIndex = siteIdToIndex.get(siteId);
    if (siteIndex === undefined) return acc;
    const { siteId: _siteId, ...rest } = acc;
    return { ...rest, siteIndex };
  });
}

function remapTokensToAccountIndex(
  tokens: Record<string, unknown>[],
  remappedAccounts: Record<string, unknown>[],
  originalAccounts: Record<string, unknown>[],
): Record<string, unknown>[] {
  if (tokens.length > 0 && 'accountIndex' in tokens[0]) return tokens;
  // Build original accountId → remapped accountIndex map
  const accountIdToIndex = new Map<number, number>();
  originalAccounts.forEach((acc, index) => {
    const id = asInt(acc.id, -1);
    if (id >= 0) accountIdToIndex.set(id, index);
  });
  if (accountIdToIndex.size === 0) return tokens;
  return tokens.map((tk) => {
    const accountId = asInt(tk.accountId, -1);
    const accountIndex = accountIdToIndex.get(accountId);
    if (accountIndex === undefined) return tk;
    const { accountId: _accountId, ...rest } = tk;
    return { ...rest, accountIndex };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function importOneSite(
  siteData: Record<string, unknown>,
  siteIndex: number,
  endpointRows: Record<string, unknown>[],
  disabledModelRows: Record<string, unknown>[],
  accountRows: Record<string, unknown>[],
  accountTokenRows: Record<string, unknown>[],
): Promise<'created' | 'updated' | 'skipped'> {
  const name = asString(siteData.name);
  const rawUrl = asString(siteData.url);
  const platform = asString(siteData.platform);

  if (!name || !rawUrl) {
    throw new Error(`站点 #${siteIndex + 1} 缺少必填字段 name 或 url`);
  }

  const analyzed = analyzePrimarySiteUrl(rawUrl);
  const canonicalUrl = analyzed.persistedUrl;
  const canonicalPlatform = platform || 'openai';

  // Check for existing site by platform + url
  const existing = await db.select().from(schema.sites)
    .where(and(eq(schema.sites.platform, canonicalPlatform), eq(schema.sites.url, canonicalUrl)))
    .get();

  const now = new Date().toISOString();
  const siteFields = {
    name,
    url: canonicalUrl,
    platform: canonicalPlatform,
    externalCheckinUrl: asNullableString(siteData.externalCheckinUrl),
    proxyUrl: asNullableString(siteData.proxyUrl),
    useSystemProxy: asBool(siteData.useSystemProxy, false),
    customHeaders: asNullableString(siteData.customHeaders),
    customHeadersOverrideRequestHeaders: asBool(siteData.customHeadersOverrideRequestHeaders, false),
    isPinned: asBool(siteData.isPinned, false),
    sortOrder: asInt(siteData.sortOrder, 0),
    globalWeight: asNumber(siteData.globalWeight, 1),
    postRefreshProbeEnabled: asBool(siteData.postRefreshProbeEnabled, false),
    postRefreshProbeModel: asString(siteData.postRefreshProbeModel) || '',
    postRefreshProbeScope: asString(siteData.postRefreshProbeScope) === 'all' ? 'all' : 'single',
    postRefreshProbeLatencyThresholdMs: asInt(siteData.postRefreshProbeLatencyThresholdMs, 0),
    updatedAt: now,
  };

  let targetSiteId: number;

  if (existing) {
    await db.update(schema.sites)
      .set(siteFields)
      .where(eq(schema.sites.id, existing.id))
      .run();
    targetSiteId = existing.id;
  } else {
    const inserted = await db.insert(schema.sites).values({
      ...siteFields,
      status: asString(siteData.status) === 'disabled' ? 'disabled' : 'active',
    }).returning().get();
    targetSiteId = getInsertedId(inserted);
  }

  // Replace API endpoints for this site
  const endpointsForSite = endpointRows.filter((row) => asInt(row.siteIndex, -1) === siteIndex);
  await db.delete(schema.siteApiEndpoints)
    .where(eq(schema.siteApiEndpoints.siteId, targetSiteId))
    .run();

  for (const ep of endpointsForSite) {
    const epUrl = asString(ep.url);
    if (!epUrl) continue;
    await db.insert(schema.siteApiEndpoints).values({
      siteId: targetSiteId,
      url: epUrl,
      enabled: asBool(ep.enabled, true),
      sortOrder: asInt(ep.sortOrder, 0),
      createdAt: now,
      updatedAt: now,
    }).run();
  }

  // Replace disabled models for this site
  const disabledForSite = disabledModelRows.filter((row) => asInt(row.siteIndex, -1) === siteIndex);
  await db.delete(schema.siteDisabledModels)
    .where(eq(schema.siteDisabledModels.siteId, targetSiteId))
    .run();

  for (const dm of disabledForSite) {
    const modelName = asString(dm.modelName);
    if (!modelName) continue;
    await db.insert(schema.siteDisabledModels).values({
      siteId: targetSiteId,
      modelName,
    }).run();
  }

  // Import connections for this site
  const accountsForSite = accountRows.filter((row) => asInt(row.siteIndex, -1) === siteIndex);
  if (accountsForSite.length > 0) {
    await importConnections(targetSiteId, accountsForSite, accountTokenRows);
  }

  return existing ? 'updated' : 'created';
}

async function importConnections(
  targetSiteId: number,
  accountRows: Record<string, unknown>[],
  accountTokenRows: Record<string, unknown>[],
): Promise<void> {
  const now = new Date().toISOString();

  for (let i = 0; i < accountRows.length; i++) {
    const accountData = accountRows[i];
    const accessToken = asString(accountData.accessToken);

    if (!accessToken) continue;

    // Match existing account by siteId + accessToken
    const existingAccount = await db.select().from(schema.accounts)
      .where(and(eq(schema.accounts.siteId, targetSiteId), eq(schema.accounts.accessToken, accessToken)))
      .get();

    let targetAccountId: number;

    if (existingAccount) {
      await db.update(schema.accounts).set({
        username: asNullableString(accountData.username),
        apiToken: asNullableString(accountData.apiToken),
        balance: asNumber(accountData.balance, 0),
        quota: asNumber(accountData.quota, 0),
        unitCost: accountData.unitCost != null ? asNumber(accountData.unitCost, 0) : null,
        valueScore: asNumber(accountData.valueScore, 0),
        status: asString(accountData.status) === 'disabled' ? 'disabled'
          : asString(accountData.status) === 'expired' ? 'expired' : 'active',
        isPinned: asBool(accountData.isPinned, false),
        sortOrder: asInt(accountData.sortOrder, 0),
        checkinEnabled: asBool(accountData.checkinEnabled, true),
        oauthProvider: asNullableString(accountData.oauthProvider),
        oauthAccountKey: asNullableString(accountData.oauthAccountKey),
        oauthProjectId: asNullableString(accountData.oauthProjectId),
        extraConfig: asNullableString(accountData.extraConfig),
        updatedAt: now,
      }).where(eq(schema.accounts.id, existingAccount.id)).run();
      targetAccountId = existingAccount.id;
    } else {
      const insertedAccount = await db.insert(schema.accounts).values({
        siteId: targetSiteId,
        username: asNullableString(accountData.username),
        accessToken,
        apiToken: asNullableString(accountData.apiToken),
        balance: asNumber(accountData.balance, 0),
        quota: asNumber(accountData.quota, 0),
        unitCost: accountData.unitCost != null ? asNumber(accountData.unitCost, 0) : null,
        valueScore: asNumber(accountData.valueScore, 0),
        status: asString(accountData.status) === 'disabled' ? 'disabled'
          : asString(accountData.status) === 'expired' ? 'expired' : 'active',
        isPinned: asBool(accountData.isPinned, false),
        sortOrder: asInt(accountData.sortOrder, 0),
        checkinEnabled: asBool(accountData.checkinEnabled, true),
        oauthProvider: asNullableString(accountData.oauthProvider),
        oauthAccountKey: asNullableString(accountData.oauthAccountKey),
        oauthProjectId: asNullableString(accountData.oauthProjectId),
        extraConfig: asNullableString(accountData.extraConfig),
      }).returning().get();
      targetAccountId = getInsertedId(insertedAccount);
    }

    // Import tokens for this account
    const tokensForAccount = accountTokenRows.filter((row) => asInt(row.accountIndex, -1) === i);
    for (const tk of tokensForAccount) {
      const tokenValue = asString(tk.token);
      const tokenName = asString(tk.name);
      if (!tokenValue || !tokenName) continue;

      // Match existing token by accountId + token value
      const existingToken = await db.select().from(schema.accountTokens)
        .where(and(eq(schema.accountTokens.accountId, targetAccountId), eq(schema.accountTokens.token, tokenValue)))
        .get();

      if (existingToken) {
        await db.update(schema.accountTokens).set({
          name: tokenName,
          tokenGroup: asNullableString(tk.tokenGroup),
          valueStatus: asString(tk.valueStatus) || 'ready',
          source: asString(tk.source) || 'manual',
          enabled: asBool(tk.enabled, true),
          isDefault: asBool(tk.isDefault, false),
          updatedAt: now,
        }).where(eq(schema.accountTokens.id, existingToken.id)).run();
      } else {
        await db.insert(schema.accountTokens).values({
          accountId: targetAccountId,
          name: tokenName,
          token: tokenValue,
          tokenGroup: asNullableString(tk.tokenGroup),
          valueStatus: asString(tk.valueStatus) || 'ready',
          source: asString(tk.source) || 'manual',
          enabled: asBool(tk.enabled, true),
          isDefault: asBool(tk.isDefault, false),
        }).run();
      }
    }
  }
}

function getInsertedId(row: { id: number | bigint } | undefined): number {
  if (!row) throw new Error('数据库插入失败：未返回新记录 ID');
  return typeof row.id === 'bigint' ? Number(row.id) : row.id;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNullableString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value === 'true' || value === '1';
  return fallback;
}

function asInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}
