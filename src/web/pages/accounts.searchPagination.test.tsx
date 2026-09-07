import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/Toast.js';
import Accounts from './Accounts.js';
import { installAccountsSnapshotCompat } from './testApiCompat.js';

const { apiMock, navigateMock } = vi.hoisted(() => ({
  apiMock: {
    getAccounts: vi.fn(),
    getAccountsSnapshot: vi.fn(),
    getAccountsQuery: vi.fn(),
    getSites: vi.fn(),
    getAccountTokens: vi.fn(),
    getAccountModelUsage: vi.fn(),
  },
  navigateMock: vi.fn(),
}));

vi.mock('../api.js', () => ({
  api: apiMock,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function collectAllNodes(startNode: ReactTestInstance): ReactTestInstance[] {
  const out: ReactTestInstance[] = [];
  function walk(node: ReactTestInstance) {
    out.push(node);
    for (const child of node.children || []) {
      if (typeof child !== 'string' && (child as ReactTestInstance).children) {
        walk(child as ReactTestInstance);
      }
    }
  }
  walk(startNode);
  return out;
}

describe('Accounts search + pagination — backend query integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installAccountsSnapshotCompat(apiMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls getAccountsQuery on mount with default pagination', async () => {
    apiMock.getAccounts.mockResolvedValue([
      {
        id: 1,
        username: 'query-user',
        accessToken: 'tok',
        apiToken: '',
        status: 'active',
        credentialMode: 'session',
        capabilities: { canCheckin: true, canRefreshBalance: true, proxyOnly: false },
        site: { id: 10, name: 'Query Site', platform: 'new-api', status: 'active', url: 'https://q.example.com' },
      },
    ]);
    apiMock.getSites.mockResolvedValue([]);

    let root!: ReturnType<typeof create>;
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

      expect(apiMock.getAccountsQuery).toHaveBeenCalled();
      const callArgs = apiMock.getAccountsQuery.mock.calls[0][0];
      expect(callArgs.limit).toBe(50);
      expect(callArgs.offset).toBe(0);
      expect(callArgs.segment).toBe('session');

      const rendered = JSON.stringify(root.toJSON());
      expect(rendered).toContain('query-user');
    } finally {
      root?.unmount();
    }
  });

  it('shows pagination controls when total > pageSize', async () => {
    const accounts = Array.from({ length: 55 }, (_, i) => ({
      id: i + 1,
      username: `user-${i + 1}`,
      accessToken: 'tok',
      apiToken: '',
      status: 'active',
      credentialMode: 'session',
      capabilities: { canCheckin: true, canRefreshBalance: true, proxyOnly: false },
      site: { id: 10, name: 'Site', platform: 'new-api', status: 'active', url: 'https://s.example.com' },
    }));
    apiMock.getAccounts.mockResolvedValue(accounts);
    apiMock.getSites.mockResolvedValue([]);

    let root!: ReturnType<typeof create>;
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

      // compat mock slices to first 50, total = 55
      const rendered = JSON.stringify(root.toJSON());
      // Should show "共 55 条"
      expect(rendered).toContain('55');
      // Should show page number 1
      expect(rendered).toContain('"1"');
      // pagination controls should be present
      const paginationNode = collectAllNodes(root.root).find(
        (n) => typeof n.props?.className === 'string' && n.props.className.includes('pagination'),
      );
      expect(paginationNode).toBeTruthy();
    } finally {
      root?.unmount();
    }
  });

  it('shows empty state when no accounts match search', async () => {
    apiMock.getAccounts.mockResolvedValue([]);
    apiMock.getAccountsQuery.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    apiMock.getSites.mockResolvedValue([{ id: 10, name: 'Site', platform: 'new-api' }]);

    let root!: ReturnType<typeof create>;
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

      const rendered = JSON.stringify(root.toJSON());
      expect(rendered).toContain('暂无 Session 连接');
    } finally {
      root?.unmount();
    }
  });
});
