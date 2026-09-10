import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useIsMobile } from '../components/useIsMobile.js';
import { useToast } from '../components/Toast.js';
import { tr } from '../i18n.js';
import ModernSelect from '../components/ModernSelect.js';
import ResponsiveFilterPanel from '../components/ResponsiveFilterPanel.js';

import type {
  UsageOverviewResponse,
  UsageBySiteResponse,
  UsageByModelResponse,
  UsageByKeyResponse,
  UsageByClientResponse,
  UsageByAccountResponse,
  TokenCompositionResponse,
} from '../api.js';

const OverviewTab = React.lazy(() => import('./usage-analytics/OverviewTab.js'));
const SiteTab = React.lazy(() => import('./usage-analytics/SiteTab.js'));
const ModelTab = React.lazy(() => import('./usage-analytics/ModelTab.js'));
const KeyTab = React.lazy(() => import('./usage-analytics/KeyTab.js'));
const ClientTab = React.lazy(() => import('./usage-analytics/ClientTab.js'));
const AccountTab = React.lazy(() => import('./usage-analytics/AccountTab.js'));
const TokenCompositionTab = React.lazy(() => import('./usage-analytics/TokenCompositionTab.js'));

type TabKey = 'overview' | 'site' | 'model' | 'key' | 'client' | 'account' | 'composition';

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'overview', label: '总览', icon: '📊' },
  { key: 'site', label: '按站点', icon: '🌐' },
  { key: 'model', label: '按模型', icon: '🤖' },
  { key: 'key', label: '按下游 Key', icon: '🔑' },
  { key: 'client', label: '按客户端', icon: '💻' },
  { key: 'account', label: '按账号', icon: '👤' },
  { key: 'composition', label: 'Token 构成', icon: '🧩' },
];

type RangePreset = 'today' | '24h' | 'week' | 'month' | '7d' | '30d' | '90d' | 'custom';

const RANGE_OPTIONS: Array<{ key: RangePreset; label: string }> = [
  { key: 'today', label: '今天' },
  { key: '24h', label: '24小时' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: '7d', label: '近7天' },
  { key: '30d', label: '近30天' },
  { key: '90d', label: '近90天' },
  { key: 'custom', label: '自定义' },
];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toLocalDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Compute the from/to day keys for a preset range (or null for custom). */
function resolvePresetRange(preset: RangePreset): { from: string; to: string } | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayKey = toLocalDayKey(today);

  if (preset === 'today') {
    return { from: todayKey, to: todayKey };
  }
  if (preset === '24h') {
    // Last 24 hours: from yesterday to today
    const yesterday = new Date(today.getTime() - 86_400_000);
    return { from: toLocalDayKey(yesterday), to: todayKey };
  }
  if (preset === 'week') {
    // This week (Monday to today)
    const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1; // Mon=0..Sun=6
    const monday = new Date(today.getTime() - dayOfWeek * 86_400_000);
    return { from: toLocalDayKey(monday), to: todayKey };
  }
  if (preset === 'month') {
    // This month (1st to today)
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
    return { from: toLocalDayKey(firstOfMonth), to: todayKey };
  }
  if (preset === '7d' || preset === '30d' || preset === '90d') {
    const n = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
    const start = new Date(today.getTime() - (n - 1) * 86_400_000);
    return { from: toLocalDayKey(start), to: todayKey };
  }
  return null; // custom
}

type SiteOption = { value: string; label: string };

function TabFallback() {
  return <div className="skeleton" style={{ width: '100%', height: 300, borderRadius: 'var(--radius-md)' }} />;
}

export default function UsageAnalytics() {
  const isMobile = useIsMobile(768);
  const toast = useToast();
  const [searchParams] = useSearchParams();

  // Seed date range from URL query params (?from=YYYY-MM-DD&to=YYYY-MM-DD) on first mount
  const [rangePreset, setRangePreset] = useState<RangePreset>(() => {
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    // YYYY-MM-DD sanity check
    const isValid = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
    return isValid(from) && isValid(to) ? 'custom' : 'today';
  });
  const [customFrom, setCustomFrom] = useState(() => {
    const from = searchParams.get('from');
    return /^\d{4}-\d{2}-\d{2}$/.test(from || '') ? from! : '';
  });
  const [customTo, setCustomTo] = useState(() => {
    const to = searchParams.get('to');
    return /^\d{4}-\d{2}-\d{2}$/.test(to || '') ? to! : '';
  });
  const [siteId, setSiteId] = useState<number | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const [overviewData, setOverviewData] = useState<UsageOverviewResponse | null>(null);
  const [siteData, setSiteData] = useState<UsageBySiteResponse | null>(null);
  const [modelData, setModelData] = useState<UsageByModelResponse | null>(null);
  const [keyData, setKeyData] = useState<UsageByKeyResponse | null>(null);
  const [clientData, setClientData] = useState<UsageByClientResponse | null>(null);
  const [accountData, setAccountData] = useState<UsageByAccountResponse | null>(null);
  const [compositionData, setCompositionData] = useState<TokenCompositionResponse | null>(null);

  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingSite, setLoadingSite] = useState(false);
  const [loadingModel, setLoadingModel] = useState(false);
  const [loadingKey, setLoadingKey] = useState(false);
  const [loadingClient, setLoadingClient] = useState(false);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [loadingComposition, setLoadingComposition] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [siteOptions, setSiteOptions] = useState<SiteOption[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>([]);

  const loadSeq = useRef(0);
  const loadedTabs = useRef<Set<TabKey>>(new Set());

  // Resolve the effective from/to day keys based on preset or custom input
  const dateRange = useMemo(() => {
    if (rangePreset === 'custom') {
      if (customFrom && customTo) {
        // Ensure from <= to
        return customFrom <= customTo
          ? { from: customFrom, to: customTo }
          : { from: customTo, to: customFrom };
      }
      if (customFrom) return { from: customFrom, to: customFrom };
      if (customTo) return { from: customTo, to: customTo };
      return null; // Invalid custom range, use default
    }
    const preset = resolvePresetRange(rangePreset);
    return preset;
  }, [rangePreset, customFrom, customTo]);

  // Load sites for the filter dropdown
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sites = await api.getSites();
        if (cancelled || !Array.isArray(sites)) return;
        const options: SiteOption[] = sites
          .filter((s: any) => s.status === 'active')
          .map((s: any) => ({ value: String(s.id), label: s.name || `site-${s.id}` }));
        if (!cancelled) setSiteOptions(options);
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load model list when site or date range changes
  useEffect(() => {
    if (!dateRange) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getUsageModels({
          from: dateRange.from,
          to: dateRange.to,
          siteId,
        });
        if (!cancelled) setModelOptions(res.models || []);
      } catch {
        if (!cancelled) setModelOptions([]);
      }
    })();
    // Clear model selection if it's no longer in the list
    if (model && cancelled === false) {
      // Will be handled below
    }
    return () => { cancelled = true; };
  }, [dateRange, siteId]);

  // Clear model filter when site changes (model list will refresh)
  useEffect(() => {
    setModel(null);
  }, [siteId]);

  const loadTab = useCallback(
    async (tab: TabKey, forceRefresh: boolean) => {
      const seq = ++loadSeq.current;
      if (!dateRange) return;

      const commonParams = {
        from: dateRange.from,
        to: dateRange.to,
        siteId,
        model,
        refresh: forceRefresh,
      };

      try {
        if (tab === 'overview') {
          setLoadingOverview(true);
          const res = await api.getUsageOverview(commonParams);
          if (seq === loadSeq.current) setOverviewData(res);
        } else if (tab === 'site') {
          setLoadingSite(true);
          const res = await api.getUsageBySite({ from: dateRange.from, to: dateRange.to, refresh: forceRefresh });
          if (seq === loadSeq.current) setSiteData(res);
        } else if (tab === 'model') {
          setLoadingModel(true);
          const res = await api.getUsageByModel(commonParams);
          if (seq === loadSeq.current) setModelData(res);
        } else if (tab === 'key') {
          setLoadingKey(true);
          const res = await api.getUsageByKey(commonParams);
          if (seq === loadSeq.current) setKeyData(res);
        } else if (tab === 'client') {
          setLoadingClient(true);
          const res = await api.getUsageByClient(commonParams);
          if (seq === loadSeq.current) setClientData(res);
        } else if (tab === 'account') {
          setLoadingAccount(true);
          const res = await api.getUsageByAccount(commonParams);
          if (seq === loadSeq.current) setAccountData(res);
        } else if (tab === 'composition') {
          setLoadingComposition(true);
          const res = await api.getTokenComposition(commonParams);
          if (seq === loadSeq.current) setCompositionData(res);
        }
        loadedTabs.current.add(tab);
      } catch (err: any) {
        if (seq === loadSeq.current) {
          toast.error(err?.message || '加载数据失败');
        }
      } finally {
        if (seq === loadSeq.current) {
          setLoadingOverview((prev) => (tab === 'overview' ? false : prev));
          setLoadingSite((prev) => (tab === 'site' ? false : prev));
          setLoadingModel((prev) => (tab === 'model' ? false : prev));
          setLoadingKey((prev) => (tab === 'key' ? false : prev));
          setLoadingClient((prev) => (tab === 'client' ? false : prev));
          setLoadingAccount((prev) => (tab === 'account' ? false : prev));
          setLoadingComposition((prev) => (tab === 'composition' ? false : prev));
        }
      }
    },
    [dateRange, siteId, model, toast],
  );

  // Load active tab on date/site/model change
  useEffect(() => {
    if (!dateRange) return;
    loadedTabs.current = new Set();
    loadTab(activeTab, false);
  }, [activeTab, dateRange, siteId, model, loadTab]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTab(activeTab, true);
    setRefreshing(false);
  }, [activeTab, loadTab]);

  const handleTabChange = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    if (!loadedTabs.current.has(tab)) {
      loadTab(tab, false);
    }
  }, [loadTab]);

  const modelSelectOptions = useMemo(
    () => modelOptions.map((m) => ({ value: m, label: m })),
    [modelOptions],
  );

  const filterControls = useMemo(() => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      {/* Site filter — empty value = "全部站点", can be cleared */}
      <ModernSelect
        value={siteId != null ? String(siteId) : ''}
        onChange={(val) => setSiteId(val ? Number(val) : null)}
        options={siteOptions}
        placeholder="全部站点"
        size="sm"
        searchable
        searchPlaceholder="搜索站点..."
      />
      {/* Model filter — only show when a site is selected or when models are available */}
      {(siteId != null || modelOptions.length > 0) && (
        <ModernSelect
          value={model || ''}
          onChange={(val) => setModel(val || null)}
          options={modelSelectOptions}
          placeholder="全部模型"
          size="sm"
          searchable
          searchPlaceholder="搜索模型..."
        />
      )}
      {/* Custom date inputs — visible when preset is 'custom' */}
      {rangePreset === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="date"
            value={customFrom}
            max={customTo || undefined}
            onChange={(e) => setCustomFrom(e.target.value)}
            style={{
              padding: '4px 8px', fontSize: 12, borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-card)',
              color: 'var(--color-text-primary)',
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>至</span>
          <input
            type="date"
            value={customTo}
            min={customFrom || undefined}
            onChange={(e) => setCustomTo(e.target.value)}
            style={{
              padding: '4px 8px', fontSize: 12, borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-card)',
              color: 'var(--color-text-primary)',
            }}
          />
        </div>
      )}
    </div>
  ), [siteId, siteOptions, model, modelOptions, modelSelectOptions, rangePreset, customFrom, customTo]);

  return (
    <div style={{ padding: isMobile ? 12 : 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          {tr('使用分析')}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Range preset buttons */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setRangePreset(opt.key)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  background: rangePreset === opt.key ? 'var(--color-primary)' : 'var(--color-bg)',
                  color: rangePreset === opt.key ? 'white' : 'var(--color-text-secondary)',
                  transition: 'all 0.2s ease',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            className="btn btn-ghost"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ fontSize: 12, border: '1px solid var(--color-border)' }}
          >
            {refreshing ? '刷新中...' : '刷新'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: 16 }}>
        <ResponsiveFilterPanel
          isMobile={isMobile}
          mobileOpen={showMobileFilters}
          onMobileOpen={() => setShowMobileFilters(true)}
          onMobileClose={() => setShowMobileFilters(false)}
          mobileTitle={tr('筛选')}
          mobileContent={filterControls}
          desktopContent={<div style={{ marginBottom: 0 }}>{filterControls}</div>}
        />
      </div>

      {/* Tabs */}
      <div style={{ marginBottom: 16 }}>
        <div className="pill-tabs" style={{ overflowX: isMobile ? 'auto' : 'visible', flexWrap: isMobile ? 'nowrap' : 'wrap' }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`pill-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => handleTabChange(tab.key)}
              style={{ whiteSpace: 'nowrap' }}
            >
              {tab.icon} {tr(tab.label)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <React.Suspense fallback={<TabFallback />}>
        {activeTab === 'overview' && (
          <OverviewTab data={overviewData} loading={loadingOverview} isMobile={isMobile} />
        )}
        {activeTab === 'site' && (
          <SiteTab data={siteData} loading={loadingSite} isMobile={isMobile} />
        )}
        {activeTab === 'model' && (
          <ModelTab data={modelData} loading={loadingModel} isMobile={isMobile} />
        )}
        {activeTab === 'key' && (
          <KeyTab data={keyData} loading={loadingKey} isMobile={isMobile} />
        )}
        {activeTab === 'client' && (
          <ClientTab data={clientData} loading={loadingClient} isMobile={isMobile} />
        )}
        {activeTab === 'account' && (
          <AccountTab data={accountData} loading={loadingAccount} isMobile={isMobile} />
        )}
        {activeTab === 'composition' && (
          <TokenCompositionTab data={compositionData} loading={loadingComposition} isMobile={isMobile} />
        )}
      </React.Suspense>
    </div>
  );
}
