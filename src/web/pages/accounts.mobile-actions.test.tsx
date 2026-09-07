import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/Toast.js';
import Accounts from './Accounts.js';
import { installAccountsSnapshotCompat } from './testApiCompat.js';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getAccounts: vi.fn(),
    getAccountsQuery: vi.fn(),
    getAccountsSnapshot: vi.fn(),
    getSites: vi.fn(),
    batchUpdateAccounts: vi.fn(),
    refreshAccountHealth: vi.fn(),
  },
}));

vi.mock('../api.js', () => ({
  api: apiMock,
}));

vi.mock('../components/useIsMobile.js', () => ({
  useIsMobile: () => true,
}));

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function collectText(node: any): string {
  return (node.children || []).map((child: any) => {
    if (typeof child === 'string') return child;
    return collectText(child);
  }).join('');
}

function findButtonByText(root: any, text: string) {
  return root.find((node: any) => (
    node.type === 'button'
    && typeof node.props.onClick === 'function'
    && collectText(node).includes(text)
  ));
}

describe('Accounts mobile actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installAccountsSnapshotCompat(apiMock);
    apiMock.getSites.mockResolvedValue([
      { id: 1, name: 'Site A', platform: 'new-api', status: 'active' },
    ]);
    const testAccounts = [
      {
        id: 1,
        siteId: 1,
        username: 'alpha',
        accessToken: 'session-alpha',
        status: 'active',
        site: { id: 1, name: 'Site A', status: 'active', platform: 'new-api' },
      },
      {
        id: 2,
        siteId: 1,
        username: 'beta',
        accessToken: 'session-beta',
        status: 'active',
        site: { id: 1, name: 'Site A', status: 'active', platform: 'new-api' },
      },
    ];
    apiMock.getAccounts.mockResolvedValue(testAccounts);
    apiMock.getAccountsQuery.mockResolvedValue({ items: testAccounts, total: 2, page: 1, pageSize: 50 });
    apiMock.batchUpdateAccounts.mockResolvedValue({
      success: true,
      successIds: [1, 2],
      failedItems: [],
    });
    apiMock.refreshAccountHealth.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('supports select-all-visible from the mobile toolbar', async () => {
    let root!: WebTestRenderer;
    try {
      await act(async () => {
        root = create(
          <MemoryRouter initialEntries={['/accounts']}>
            <ToastProvider>
              <Accounts />
            </ToastProvider>
          </MemoryRouter>,
        );
      });
      await flushMicrotasks();

      const selectAllButton = root.root.find((node) => node.props['data-testid'] === 'accounts-mobile-select-all');
      await act(async () => {
        selectAllButton.props.onClick();
      });
      await flushMicrotasks();

      const batchButton = root.root.find((node) => node.props['data-testid'] === 'accounts-batch-refresh-balance');
      await act(async () => {
        batchButton.props.onClick();
      });
      await flushMicrotasks();

      expect(apiMock.batchUpdateAccounts).toHaveBeenCalledWith({
        ids: [1, 2],
        action: 'refreshBalance',
      });
    } finally {
      root?.unmount();
    }
  });

  it('clears only the visible segment selection when toggling mobile select-all off', async () => {
    let root!: WebTestRenderer;
    try {
      apiMock.getAccounts.mockResolvedValue([
        {
          id: 1,
          siteId: 1,
          username: 'alpha',
          accessToken: 'session-alpha',
          status: 'active',
          credentialMode: 'session',
          site: { id: 1, name: 'Site A', status: 'active', platform: 'new-api' },
        },
        {
          id: 2,
          siteId: 1,
          username: 'beta',
          accessToken: '',
          status: 'active',
          credentialMode: 'apikey',
          site: { id: 1, name: 'Site A', status: 'active', platform: 'new-api' },
        },
      ]);
      apiMock.getAccountsQuery.mockImplementation(async (params?: any) => {
        const allAccounts = await apiMock.getAccounts();
        const segment = params?.segment;
        const items = segment === 'apikey'
          ? allAccounts.filter((a: any) => a.credentialMode === 'apikey')
          : allAccounts.filter((a: any) => a.credentialMode !== 'apikey');
        return { items, total: items.length, page: 1, pageSize: 50 };
      });

      await act(async () => {
        root = create(
          <MemoryRouter initialEntries={['/accounts?segment=apikey']}>
            <ToastProvider>
              <Accounts />
            </ToastProvider>
          </MemoryRouter>,
        );
      });
      await flushMicrotasks();

      // API Key segment shows only beta
      const selectAllButton = root.root.find((node) => node.props['data-testid'] === 'accounts-mobile-select-all');
      await act(async () => {
        selectAllButton.props.onClick();
      });
      await flushMicrotasks();
      expect(collectText(root.root)).toContain('已选 1 项');

      // Switch to session segment — beta selection is pruned by load()
      const sessionSegmentButton = findButtonByText(root.root, '账号管理');
      await act(async () => {
        sessionSegmentButton.props.onClick();
      });
      await flushMicrotasks();

      // Session segment shows alpha; select all visible
      const sessionSelectAll = root.root.find((node) => node.props['data-testid'] === 'accounts-mobile-select-all');
      await act(async () => {
        sessionSelectAll.props.onClick();
      });
      await flushMicrotasks();
      expect(collectText(root.root)).toContain('已选 1 项');

      // Deselect all visible — clears only the session segment accounts
      const clearVisibleButton = root.root.find((node) => node.props['data-testid'] === 'accounts-mobile-select-all');
      await act(async () => {
        clearVisibleButton.props.onClick();
      });
      await flushMicrotasks();

      // No selection banner when 0 selected
      expect(collectText(root.root)).not.toContain('已选');

      // Switch back to API Key — beta was already pruned, no selection remains
      const apiKeySegmentButton = findButtonByText(root.root, 'API Key管理');
      await act(async () => {
        apiKeySegmentButton.props.onClick();
      });
      await flushMicrotasks();
      expect(collectText(root.root)).not.toContain('已选');
    } finally {
      root?.unmount();
    }
  });
});
