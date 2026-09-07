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

function collectText(node: ReactTestInstance): string {
  return (node.children || [])
    .map((child) => (typeof child === 'string' ? child : collectText(child)))
    .join('');
}

function findByText(root: ReactTestInstance, text: string): ReactTestInstance | null {
  let found: ReactTestInstance | null = null;
  function walk(node: ReactTestInstance) {
    if (found) return;
    const nodeText = collectText(node);
    if (nodeText.includes(text)) {
      found = node;
      return;
    }
    for (const child of node.children || []) {
      if (typeof child !== 'string' && (child as ReactTestInstance).children) {
        walk(child as ReactTestInstance);
      }
    }
  }
  walk(root);
  return found;
}

describe('Accounts availability modal — model usage breakdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installAccountsSnapshotCompat(apiMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('opens the availability modal and renders per-model usage rows from getAccountModelUsage', async () => {
    apiMock.getAccounts.mockResolvedValue([
      {
        id: 42,
        username: 'avail-user',
        accessToken: 'avail-token',
        apiToken: '',
        status: 'active',
        credentialMode: 'session',
        capabilities: { canCheckin: true, canRefreshBalance: true, proxyOnly: false },
        site: { id: 10, name: 'Avail Site', platform: 'new-api', status: 'active', url: 'https://avail.example.com' },
        availability: {
          totalRequests: 4,
          successCount: 3,
          failedCount: 1,
          availabilityPercent: 75,
          averageLatencyMs: 150,
          buckets: [
            { startUtc: '2026-08-25T00:00:00.000Z', label: '2026-08-25 00:00', totalRequests: 4, successCount: 3, failedCount: 1, availabilityPercent: 75, averageLatencyMs: 150 },
          ],
        },
        lastCallAt: '2026-08-25T08:00:00.000Z',
      },
    ]);
    apiMock.getSites.mockResolvedValue([
      { id: 10, name: 'Avail Site', platform: 'new-api', status: 'active' },
    ]);

    apiMock.getAccountModelUsage.mockResolvedValue({
      accountId: 42,
      windowHours: 24,
      windowStartUtc: '2026-08-24 16:00:00',
      models: [
        {
          model: 'gpt-5',
          totalRequests: 3,
          successCount: 2,
          failedCount: 1,
          availabilityPercent: 66.7,
          averageLatencyMs: 167,
          lastCallAt: '2026-08-25T07:50:00.000Z',
          totalTokens: 160,
          totalSpend: 0.26,
        },
        {
          model: 'claude-3.5-sonnet',
          totalRequests: 1,
          successCount: 1,
          failedCount: 0,
          availabilityPercent: 100,
          averageLatencyMs: 500,
          lastCallAt: '2026-08-25T07:00:00.000Z',
          totalTokens: 200,
          totalSpend: 0.4,
        },
      ],
    });

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

      const rendered = JSON.stringify(root.toJSON());
      // The availability cell shows the 75% availability
      expect(rendered).toContain('75%');

      // Find the availability cell trigger and click it to open the modal.
      // The cell renders the percent span as a clickable button-like div.
      function collectAllNodes(): ReactTestInstance[] {
        const out: ReactTestInstance[] = [];
        function walk(node: ReactTestInstance) {
          out.push(node);
          for (const child of node.children || []) {
            if (typeof child !== 'string' && (child as ReactTestInstance).children) {
              walk(child as ReactTestInstance);
            }
          }
        }
        walk(root.root);
        return out;
      }

      const cell = collectAllNodes().find(
        (n) =>
          typeof n.props?.['data-tooltip'] === 'string' &&
          n.props['data-tooltip'] === '点击查看详情',
      );
      expect(cell).toBeTruthy();
      const onClick = cell!.props.onClick;
      expect(typeof onClick).toBe('function');

      await act(async () => {
        onClick();
      });
      await flushMicrotasks();

      // The modal fetches model usage; assert the mock was called with the account id.
      expect(apiMock.getAccountModelUsage).toHaveBeenCalledWith(42);

      const modalText = JSON.stringify(root.toJSON());
      // Modal title
      expect(modalText).toContain('可用性详情');
      // Model usage section header
      expect(modalText).toContain('模型调用明细');
      // Both model names appear
      expect(modalText).toContain('gpt-5');
      expect(modalText).toContain('claude-3.5-sonnet');
      // Column headers
      expect(modalText).toContain('平均响应');
      expect(modalText).toContain('最近调用');

      // Clicking the success-count of the gpt-5 row navigates to the logs page
      // with accountId, model search, status, and from (window start).
      navigateMock.mockClear();
      // Re-collect nodes after the modal opened so the in-modal buttons exist.
      const successButton = collectAllNodes().find(
        (n) =>
          n.type === 'button' &&
          typeof n.props?.onClick === 'function' &&
          collectText(n) === '2',
      );
      expect(successButton).toBeTruthy();
      await act(async () => {
        successButton!.props.onClick();
      });

      expect(navigateMock).toHaveBeenCalledTimes(1);
      const target = navigateMock.mock.calls[0]?.[0] as string;
      expect(target).toMatch(/^\/logs\?/);
      const params = new URLSearchParams(target.slice('/logs?'.length));
      expect(params.get('accountId')).toBe('42');
      expect(params.get('q')).toBe('gpt-5');
      expect(params.get('status')).toBe('success');
      expect(params.get('from')).toBeTruthy();
    } finally {
      root?.unmount();
    }
  });

  it('shows an empty-state message when there are no model usage rows', async () => {
    apiMock.getAccounts.mockResolvedValue([
      {
        id: 7,
        username: 'empty-user',
        accessToken: 'empty-token',
        apiToken: '',
        status: 'active',
        credentialMode: 'session',
        capabilities: { canCheckin: true, canRefreshBalance: true, proxyOnly: false },
        site: { id: 3, name: 'Empty Site', platform: 'new-api', status: 'active', url: 'https://empty.example.com' },
        availability: {
          totalRequests: 1,
          successCount: 1,
          failedCount: 0,
          availabilityPercent: 100,
          averageLatencyMs: 50,
          buckets: [
            { startUtc: '2026-08-25T00:00:00.000Z', label: '2026-08-25 00:00', totalRequests: 1, successCount: 1, failedCount: 0, availabilityPercent: 100, averageLatencyMs: 50 },
          ],
        },
        lastCallAt: '2026-08-25T08:00:00.000Z',
      },
    ]);
    apiMock.getSites.mockResolvedValue([
      { id: 3, name: 'Empty Site', platform: 'new-api', status: 'active' },
    ]);
    apiMock.getAccountModelUsage.mockResolvedValue({
      accountId: 7,
      windowHours: 24,
      windowStartUtc: '2026-08-24 16:00:00',
      models: [],
    });

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

      const allTextNodes: ReactTestInstance[] = [];
      function collectNodes(node: ReactTestInstance) {
        allTextNodes.push(node);
        for (const child of node.children || []) {
          if (typeof child !== "string" && (child as ReactTestInstance).children) {
            collectNodes(child as ReactTestInstance);
          }
        }
      }
      collectNodes(root.root);

      const cell = allTextNodes.find(
        (n) =>
          typeof n.props?.['data-tooltip'] === 'string' &&
          n.props['data-tooltip'] === '点击查看详情',
      );
      expect(cell).toBeTruthy();

      await act(async () => {
        cell!.props.onClick();
      });
      await flushMicrotasks();

      expect(apiMock.getAccountModelUsage).toHaveBeenCalledWith(7);
      const modalText = JSON.stringify(root.toJSON());
      expect(modalText).toContain('模型调用明细');
      expect(modalText).toContain('近期无模型调用记录');
    } finally {
      root?.unmount();
    }
  });
});
