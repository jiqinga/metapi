import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.js';
import type { RoutingWeights } from '../helpers/routingProfiles.js';

export const SECONDS_PER_DAY = 24 * 60 * 60;

export const ROUTE_COOLDOWN_UNIT_OPTIONS = [
  { value: 'second', label: '秒', multiplierSec: 1 },
  { value: 'minute', label: '分钟', multiplierSec: 60 },
  { value: 'hour', label: '小时', multiplierSec: 60 * 60 },
  { value: 'day', label: '天', multiplierSec: SECONDS_PER_DAY },
] as const;

export type DbDialect = 'sqlite' | 'mysql' | 'postgres';
export type RouteCooldownUnit = typeof ROUTE_COOLDOWN_UNIT_OPTIONS[number]['value'];

export const defaultWeights: RoutingWeights = {
  baseWeightFactor: 0.5,
  valueScoreFactor: 0.5,
  costWeight: 0.4,
  balanceWeight: 0.3,
  usageWeight: 0.3,
};

export type RuntimeSettings = {
  checkinEnabled: boolean;
  checkinCron: string;
  checkinScheduleMode: 'cron' | 'interval';
  checkinIntervalHours: number;
  balanceRefreshEnabled: boolean;
  balanceRefreshModelsEnabled: boolean;
  balanceRefreshCron: string;
  dailySummaryEnabled: boolean;
  logCleanupEnabled: boolean;
  logCleanupCron: string;
  logCleanupUsageLogsEnabled: boolean;
  logCleanupProgramLogsEnabled: boolean;
  logCleanupRetentionDays: number;
  modelAvailabilityProbeEnabled: boolean;
  codexUpstreamWebsocketEnabled: boolean;
  responsesCompactFallbackToResponsesEnabled: boolean;
  disableCrossProtocolFallback: boolean;
  proxySessionChannelConcurrencyLimit: number;
  proxySessionChannelQueueWaitMs: number;
  routingFallbackUnitCost: number;
  proxyFirstByteTimeoutSec: number;
  accountVerifyTimeoutMs: number;
  proxyTestTimeoutMs: number;
  modelProtocolBadgeWindowDays: number;
  accountAvailabilityWindowHours: number;
  embeddingCacheEnabled: boolean;
  embeddingCacheTtlSec: number;
  embeddingCacheMaxEntries: number;
  routeFailureCooldownMaxValue: number;
  routeFailureCooldownMaxUnit: RouteCooldownUnit;
  routingWeights: RoutingWeights;
  systemProxyUrl: string;
  proxyErrorKeywords: string[];
  proxyEmptyContentFailEnabled: boolean;
  claudeCodeCloakEnabled: boolean;
  codexCloakEnabled: boolean;
  proxyTokenMasked?: string;
  adminIpAllowlist?: string[];
  currentAdminIp?: string;
  globalBlockedBrands?: string[];
  globalAllowedModels?: string[];
};

export type RuntimeDatabaseState = {
  active: {
    dialect: DbDialect;
    connection: string;
    ssl: boolean;
  };
  saved: {
    dialect: DbDialect;
    connection: string;
    ssl: boolean;
  } | null;
  restartRequired: boolean;
};

export function resolveRouteCooldownInput(seconds: number | null | undefined): {
  value: number;
  unit: RouteCooldownUnit;
} {
  const normalizedSeconds = Number.isFinite(Number(seconds)) && Number(seconds) > 0
    ? Math.max(1, Math.trunc(Number(seconds)))
    : 30 * SECONDS_PER_DAY;

  for (const option of [...ROUTE_COOLDOWN_UNIT_OPTIONS].reverse()) {
    if (normalizedSeconds % option.multiplierSec === 0) {
      return {
        value: normalizedSeconds / option.multiplierSec,
        unit: option.value,
      };
    }
  }

  return {
    value: normalizedSeconds,
    unit: 'second',
  };
}

export function toRouteCooldownSeconds(value: number, unit: RouteCooldownUnit): number {
  const normalizedValue = Number.isFinite(value) && value > 0 ? Math.max(1, Math.trunc(value)) : 1;
  const unitConfig = ROUTE_COOLDOWN_UNIT_OPTIONS.find((option) => option.value === unit) || ROUTE_COOLDOWN_UNIT_OPTIONS[0];
  return normalizedValue * unitConfig.multiplierSec;
}

export function useSettingsData() {
  const [runtime, setRuntime] = useState<RuntimeSettings>({
    checkinEnabled: true,
    checkinCron: '0 8 * * *',
    checkinScheduleMode: 'cron',
    checkinIntervalHours: 6,
    balanceRefreshEnabled: true,
    balanceRefreshModelsEnabled: true,
    balanceRefreshCron: '0 * * * *',
    dailySummaryEnabled: true,
    logCleanupEnabled: true,
    logCleanupCron: '0 6 * * *',
    logCleanupUsageLogsEnabled: false,
    logCleanupProgramLogsEnabled: false,
    logCleanupRetentionDays: 30,
    modelAvailabilityProbeEnabled: false,
    codexUpstreamWebsocketEnabled: false,
    responsesCompactFallbackToResponsesEnabled: false,
    disableCrossProtocolFallback: false,
    proxySessionChannelConcurrencyLimit: 2,
    proxySessionChannelQueueWaitMs: 1500,
    routingFallbackUnitCost: 1,
    proxyFirstByteTimeoutSec: 0,
    accountVerifyTimeoutMs: 10000,
    proxyTestTimeoutMs: 30000,
    modelProtocolBadgeWindowDays: 3,
    accountAvailabilityWindowHours: 24,
    embeddingCacheEnabled: true,
    embeddingCacheTtlSec: 21600,
    embeddingCacheMaxEntries: 1000,
    routeFailureCooldownMaxValue: 30,
    routeFailureCooldownMaxUnit: 'day',
    routingWeights: defaultWeights,
    systemProxyUrl: '',
    proxyErrorKeywords: [],
    proxyEmptyContentFailEnabled: false,
    claudeCodeCloakEnabled: false,
    codexCloakEnabled: false,
  });
  const [maskedToken, setMaskedToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [savedModelAvailabilityProbeEnabled, setSavedModelAvailabilityProbeEnabled] = useState(false);
  const [blockedBrands, setBlockedBrands] = useState<string[]>([]);
  const [allowedModels, setAllowedModels] = useState<string[]>([]);
  const [proxyErrorKeywordsText, setProxyErrorKeywordsText] = useState('');
  const [adminIpAllowlistText, setAdminIpAllowlistText] = useState('');
  const [payloadRules, setPayloadRules] = useState<unknown>(undefined);
  const [migrationDialect, setMigrationDialect] = useState<DbDialect>('postgres');
  const [runtimeDatabaseState, setRuntimeDatabaseState] = useState<RuntimeDatabaseState | null>(null);
  const [allBrandNames, setAllBrandNames] = useState<string[] | null>(null);
  const [availableModels, setAvailableModels] = useState<string[] | null>(null);
  const toast = useToast();

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [authInfo, runtimeInfo, runtimeDatabaseInfo] = await Promise.all([
        api.getAuthInfo(),
        api.getRuntimeSettings(),
        api.getRuntimeDatabaseConfig(),
      ]);
      setMaskedToken(authInfo.masked || '****');
      const routeCooldownInput = resolveRouteCooldownInput(runtimeInfo.tokenRouterFailureCooldownMaxSec);
      setRuntime({
        checkinEnabled: runtimeInfo.checkinEnabled !== false,
        checkinCron: runtimeInfo.checkinCron || '0 8 * * *',
        checkinScheduleMode: runtimeInfo.checkinScheduleMode === 'interval' ? 'interval' : 'cron',
        checkinIntervalHours: Number(runtimeInfo.checkinIntervalHours) >= 1
          ? Math.min(24, Math.trunc(Number(runtimeInfo.checkinIntervalHours)))
          : 6,
        balanceRefreshEnabled: runtimeInfo.balanceRefreshEnabled !== false,
        balanceRefreshModelsEnabled: runtimeInfo.balanceRefreshModelsEnabled !== false,
        balanceRefreshCron: runtimeInfo.balanceRefreshCron || '0 * * * *',
        dailySummaryEnabled: runtimeInfo.dailySummaryEnabled !== false,
        logCleanupEnabled: runtimeInfo.logCleanupEnabled !== false,
        logCleanupCron: runtimeInfo.logCleanupCron || '0 6 * * *',
        logCleanupUsageLogsEnabled: !!runtimeInfo.logCleanupUsageLogsEnabled,
        logCleanupProgramLogsEnabled: !!runtimeInfo.logCleanupProgramLogsEnabled,
        logCleanupRetentionDays: Number(runtimeInfo.logCleanupRetentionDays) >= 1
          ? Math.trunc(Number(runtimeInfo.logCleanupRetentionDays))
          : 30,
        modelAvailabilityProbeEnabled: !!runtimeInfo.modelAvailabilityProbeEnabled,
        codexUpstreamWebsocketEnabled: !!runtimeInfo.codexUpstreamWebsocketEnabled,
        responsesCompactFallbackToResponsesEnabled: !!runtimeInfo.responsesCompactFallbackToResponsesEnabled,
        disableCrossProtocolFallback: !!runtimeInfo.disableCrossProtocolFallback,
        proxySessionChannelConcurrencyLimit: Number(runtimeInfo.proxySessionChannelConcurrencyLimit) >= 0
          ? Math.trunc(Number(runtimeInfo.proxySessionChannelConcurrencyLimit))
          : 2,
        proxySessionChannelQueueWaitMs: Number(runtimeInfo.proxySessionChannelQueueWaitMs) >= 0
          ? Math.trunc(Number(runtimeInfo.proxySessionChannelQueueWaitMs))
          : 1500,
        routingFallbackUnitCost: Number(runtimeInfo.routingFallbackUnitCost) > 0
          ? Number(runtimeInfo.routingFallbackUnitCost)
          : 1,
        proxyFirstByteTimeoutSec: Number(runtimeInfo.proxyFirstByteTimeoutSec) >= 0
          ? Math.trunc(Number(runtimeInfo.proxyFirstByteTimeoutSec))
          : 0,
        accountVerifyTimeoutMs: Number(runtimeInfo.accountVerifyTimeoutMs) >= 3000
          ? Math.trunc(Number(runtimeInfo.accountVerifyTimeoutMs))
          : 10000,
        proxyTestTimeoutMs: Number(runtimeInfo.proxyTestTimeoutMs) >= 3000
          ? Math.trunc(Number(runtimeInfo.proxyTestTimeoutMs))
          : 30000,
        modelProtocolBadgeWindowDays: Number(runtimeInfo.modelProtocolBadgeWindowDays) >= 1
          ? Math.trunc(Number(runtimeInfo.modelProtocolBadgeWindowDays))
          : 3,
        accountAvailabilityWindowHours: Number(runtimeInfo.accountAvailabilityWindowHours) >= 1
          ? Math.trunc(Number(runtimeInfo.accountAvailabilityWindowHours))
          : 24,
        embeddingCacheEnabled: runtimeInfo.embeddingCacheEnabled !== false,
        embeddingCacheTtlSec: Number(runtimeInfo.embeddingCacheTtlSec) >= 1
          ? Math.trunc(Number(runtimeInfo.embeddingCacheTtlSec))
          : 21600,
        embeddingCacheMaxEntries: Number(runtimeInfo.embeddingCacheMaxEntries) >= 1
          ? Math.trunc(Number(runtimeInfo.embeddingCacheMaxEntries))
          : 1000,
        routeFailureCooldownMaxValue: routeCooldownInput.value,
        routeFailureCooldownMaxUnit: routeCooldownInput.unit,
        routingWeights: {
          ...defaultWeights,
          ...(runtimeInfo.routingWeights || {}),
        },
        systemProxyUrl: typeof runtimeInfo.systemProxyUrl === 'string' ? runtimeInfo.systemProxyUrl : '',
        proxyErrorKeywords: Array.isArray(runtimeInfo.proxyErrorKeywords)
          ? runtimeInfo.proxyErrorKeywords.filter((item: unknown) => typeof item === 'string')
          : [],
        proxyEmptyContentFailEnabled: !!runtimeInfo.proxyEmptyContentFailEnabled,
        claudeCodeCloakEnabled: !!runtimeInfo.claudeCodeCloakEnabled,
        codexCloakEnabled: !!runtimeInfo.codexCloakEnabled,
        proxyTokenMasked: runtimeInfo.proxyTokenMasked || '',
        adminIpAllowlist: Array.isArray(runtimeInfo.adminIpAllowlist)
          ? runtimeInfo.adminIpAllowlist.filter((item: unknown) => typeof item === 'string')
          : [],
        currentAdminIp: typeof runtimeInfo.currentAdminIp === 'string' ? runtimeInfo.currentAdminIp : '',
        globalBlockedBrands: Array.isArray(runtimeInfo.globalBlockedBrands) ? runtimeInfo.globalBlockedBrands : [],
        globalAllowedModels: Array.isArray(runtimeInfo.globalAllowedModels) ? runtimeInfo.globalAllowedModels : [],
      });
      setSavedModelAvailabilityProbeEnabled(!!runtimeInfo.modelAvailabilityProbeEnabled);
      setBlockedBrands(Array.isArray(runtimeInfo.globalBlockedBrands) ? runtimeInfo.globalBlockedBrands : []);
      setAllowedModels(Array.isArray(runtimeInfo.globalAllowedModels) ? runtimeInfo.globalAllowedModels : []);
      setProxyErrorKeywordsText(
        Array.isArray(runtimeInfo.proxyErrorKeywords)
          ? runtimeInfo.proxyErrorKeywords.filter((item: unknown) => typeof item === 'string').join('\n')
          : '',
      );
      setPayloadRules(runtimeInfo.payloadRules);
      setAdminIpAllowlistText(
        Array.isArray(runtimeInfo.adminIpAllowlist)
          ? runtimeInfo.adminIpAllowlist.join('\n')
          : '',
      );
      if (runtimeDatabaseInfo?.active?.dialect) {
        const preferredDialect = (runtimeDatabaseInfo?.saved?.dialect || runtimeDatabaseInfo.active.dialect) as DbDialect;
        setMigrationDialect(preferredDialect);
      }
      setRuntimeDatabaseState({
        active: {
          dialect: (runtimeDatabaseInfo?.active?.dialect || 'sqlite') as DbDialect,
          connection: String(runtimeDatabaseInfo?.active?.connection || ''),
          ssl: !!runtimeDatabaseInfo?.active?.ssl,
        },
        saved: runtimeDatabaseInfo?.saved
          ? {
            dialect: runtimeDatabaseInfo.saved.dialect as DbDialect,
            connection: String(runtimeDatabaseInfo.saved.connection || ''),
            ssl: !!runtimeDatabaseInfo.saved.ssl,
          }
          : null,
        restartRequired: !!runtimeDatabaseInfo?.restartRequired,
      });
    } catch (err: any) {
      toast.error(err?.message || '加载设置失败');
    } finally {
      setLoading(false);
    }
    // Load brand list in background (non-blocking, best-effort)
    api.getBrandList()
      .then((res: any) => setAllBrandNames(Array.isArray(res?.brands) ? res.brands : []))
      .catch(() => setAllBrandNames([]));
    // Load available models in background (non-blocking, best-effort)
    api.getModelTokenCandidates()
      .then((res: any) => {
        const models = res?.models || {};
        setAvailableModels(Object.keys(models).sort());
      })
      .catch(() => setAvailableModels([]));
  };

  useEffect(() => {
    loadSettings();
  }, []);

  return {
    loading,
    loadSettings,
    runtime,
    setRuntime,
    maskedToken,
    setMaskedToken,
    savedModelAvailabilityProbeEnabled,
    setSavedModelAvailabilityProbeEnabled,
    blockedBrands,
    setBlockedBrands,
    allowedModels,
    setAllowedModels,
    proxyErrorKeywordsText,
    setProxyErrorKeywordsText,
    adminIpAllowlistText,
    setAdminIpAllowlistText,
    payloadRules,
    setPayloadRules,
    migrationDialect,
    setMigrationDialect,
    runtimeDatabaseState,
    setRuntimeDatabaseState,
    allBrandNames,
    availableModels,
  };
}

export type SettingsData = ReturnType<typeof useSettingsData>;
