type MockLike = ((...args: any[]) => any) & {
  mockImplementation?: (impl: (...args: any[]) => any) => unknown;
};

type AccountsCompatApiMock = {
  getAccounts?: MockLike;
  getAccountsSnapshot?: MockLike;
  getAccountsQuery?: MockLike;
  getSites?: MockLike;
};

type DashboardCompatApiMock = {
  getDashboard?: MockLike;
  getDashboardSnapshot?: MockLike;
  getDashboardInsights?: MockLike;
  getSiteDistribution?: MockLike;
  getSiteTrend?: MockLike;
  getSites?: MockLike;
  getSiteSnapshot?: MockLike;
};

const FIXTURE_GENERATED_AT = '2026-04-09T00:00:00.000Z';

function buildDerivedSites(accounts: any[]): any[] {
  const siteMap = new Map<number, any>();
  for (const account of accounts) {
    const site = account?.site;
    const siteId = Number(site?.id);
    if (!Number.isFinite(siteId) || siteId <= 0) continue;
    if (!siteMap.has(siteId)) {
      siteMap.set(siteId, { ...site });
    }
  }
  return Array.from(siteMap.values());
}

export function installAccountsSnapshotCompat(apiMock: AccountsCompatApiMock) {
  apiMock.getAccountsSnapshot?.mockImplementation?.(async () => {
    const accountsResult = typeof apiMock.getAccounts === "function"
      ? await apiMock.getAccounts()
      : [];
    const siteResult = typeof apiMock.getSites === "function"
      ? await apiMock.getSites()
      : [];
    const accounts = Array.isArray(accountsResult) ? accountsResult : [];
    const sites = Array.isArray(siteResult) && siteResult.length > 0
      ? siteResult
      : buildDerivedSites(accounts);

    return {
      generatedAt: FIXTURE_GENERATED_AT,
      accounts,
      sites,
    };
  });

  apiMock.getAccountsQuery?.mockImplementation?.(async (params?: {
    search?: string;
    segment?: string;
    siteId?: number;
    status?: string;
    limit?: number;
    offset?: number;
  }) => {
    const accountsResult = typeof apiMock.getAccounts === "function"
      ? await apiMock.getAccounts()
      : [];
    const accounts = Array.isArray(accountsResult) ? accountsResult : [];
    let filtered = accounts;
    const segment = params?.segment;
    if (segment === "session" || segment === "apikey") {
      filtered = filtered.filter(
        (a: any) => {
          const mode = String(a?.credentialMode || "").toLowerCase();
          if (mode === "session" || mode === "apikey") return mode === segment;
          const proxyOnly = a?.capabilities?.proxyOnly;
          return typeof proxyOnly === "boolean"
            ? (proxyOnly ? "apikey" : "session") === segment
            : segment === "session";
        },
      );
    }
    if (params?.siteId && params.siteId > 0) {
      filtered = filtered.filter((a: any) => a?.site?.id === params.siteId);
    }
    if (params?.status) {
      filtered = filtered.filter((a: any) => a?.status === params.status);
    }
    const total = filtered.length;
    const limit = params?.limit && params.limit > 0 ? params.limit : 50;
    const offset = params?.offset && params.offset > 0 ? params.offset : 0;
    const items = filtered.slice(offset, offset + limit);
    return { items, total, page: Math.floor(offset / limit) + 1, pageSize: limit };
  });
}

export function installDashboardSnapshotCompat(apiMock: DashboardCompatApiMock) {
  apiMock.getDashboardSnapshot?.mockImplementation?.(async () => {
    if (typeof apiMock.getDashboard !== 'function') return null;
    return apiMock.getDashboard();
  });

  apiMock.getDashboardInsights?.mockImplementation?.(async () => {
    if (typeof apiMock.getDashboard !== 'function') return null;
    return apiMock.getDashboard();
  });

  apiMock.getSiteSnapshot?.mockImplementation?.(async (days = 7) => {
    const distributionResult = typeof apiMock.getSiteDistribution === 'function'
      ? await apiMock.getSiteDistribution()
      : [];
    const trendResult = typeof apiMock.getSiteTrend === 'function'
      ? await apiMock.getSiteTrend(days)
      : [];
    const sitesResult = typeof apiMock.getSites === 'function'
      ? await apiMock.getSites()
      : [];

    return {
      generatedAt: FIXTURE_GENERATED_AT,
      distribution: Array.isArray(distributionResult?.distribution)
        ? distributionResult.distribution
        : Array.isArray(distributionResult)
          ? distributionResult
          : [],
      trend: Array.isArray(trendResult?.trend)
        ? trendResult.trend
        : Array.isArray(trendResult)
          ? trendResult
          : [],
      sites: Array.isArray(sitesResult) ? sitesResult : [],
    };
  });
}
