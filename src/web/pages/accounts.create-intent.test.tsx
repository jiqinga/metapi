import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import ModernSelect from '../components/ModernSelect.js';
import { ToastProvider } from '../components/Toast.js';
import Accounts from './Accounts.js';
import { installAccountsSnapshotCompat } from './testApiCompat.js';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getAccounts: vi.fn(),
    getAccountsQuery: vi.fn(),
    getAccountsSnapshot: vi.fn(),
    getSites: vi.fn(),
    getAccountTokens: vi.fn(),
  },
}));

vi.mock('../api.js', () => ({
  api: apiMock,
}));

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderAccounts(
  initialEntry: string,
  sites: Array<{ id: number; name: string; url?: string; platform: string; status: string }> = [
    { id: 10, name: 'Demo Site', platform: 'new-api', status: 'active' },
  ],
) {
  apiMock.getAccounts.mockResolvedValue([]);
  apiMock.getSites.mockResolvedValue(sites);
  apiMock.getAccountTokens.mockResolvedValue([]);
  // Ensure getAccountsQuery returns the paginated shape the component expects
  apiMock.getAccountsQuery.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });

  let root!: WebTestRenderer;
  await act(async () => {
    root = create(
      <MemoryRouter initialEntries={[initialEntry]}>
        <ToastProvider>
          <Accounts />
        </ToastProvider>
      </MemoryRouter>,
    );
  });
  await flushMicrotasks();
  // With getAccountsQuery, sites load via a separate getSites() call after
  // the accounts query resolves — give that extra round a chance to settle.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return root!;
}

describe('Accounts create intent handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installAccountsSnapshotCompat(apiMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('opens the session add modal and preselects the site for session create intent', async () => {
    const root = await renderAccounts('/accounts?create=1&siteId=10');
    try {
      const rendered = JSON.stringify(root.toJSON());
      expect(rendered).toContain('添加 Session 连接');
      expect(rendered).not.toContain('添加 API Key 连接');

      const selects = root.root.findAllByType(ModernSelect);
      // The add modal's site selector is the ModernSelect with value '10'
      const siteSelect = selects.find((s: any) => s.props.value === '10');
      expect(siteSelect).toBeDefined();
    } finally {
      root?.unmount();
    }
  });

  it('opens the apikey add modal and preselects the site for apikey create intent', async () => {
    const root = await renderAccounts('/accounts?segment=apikey&create=1&siteId=10');
    try {
      const rendered = JSON.stringify(root.toJSON());
      expect(rendered).toContain('添加 API Key 连接');

      const selects = root.root.findAllByType(ModernSelect);
      const siteSelect = selects.find((s: any) => s.props.value === '10');
      expect(siteSelect).toBeDefined();
    } finally {
      root?.unmount();
    }
  });

  it('uses searchable site selectors for manual connection creation', async () => {
    const root = await renderAccounts('/accounts', [
      { id: 10, name: 'Demo Site', url: 'https://demo.example.com', platform: 'new-api', status: 'active' },
      { id: 11, name: 'Codex Workspace', url: 'https://workspace.example.com', platform: 'codex', status: 'active' },
    ]);
    try {
      const addButton = root.root.find((node) => (
        node.type === 'button'
        && typeof node.props.onClick === 'function'
        && typeof node.props.className === 'string'
        && node.props.className.includes('btn btn-primary')
        && typeof node.props.children === 'string'
        && node.props.children.includes('添加连接')
      ));

      await act(async () => {
        addButton.props.onClick();
      });
      await flushMicrotasks();

      const selects = root.root.findAllByType(ModernSelect);
      // The add modal's site selector is the searchable one
      const siteSelect = selects.find((s: any) => s.props.searchable);
      expect(siteSelect?.props.searchable).toBe(true);
      expect(siteSelect?.props.searchPlaceholder).toBe('筛选站点（名称 / 平台 / URL）');
      expect(siteSelect?.props.options).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: '11',
            label: 'Codex Workspace (codex)',
            description: 'https://workspace.example.com',
          }),
        ]),
      );
    } finally {
      root?.unmount();
    }
  });

  it('ignores create intent in the tokens segment', async () => {
    const root = await renderAccounts('/accounts?segment=tokens&create=1&siteId=10');
    try {
      const rendered = JSON.stringify(root.toJSON());
      expect(rendered).not.toContain('添加 Session 连接');
      expect(rendered).not.toContain('添加 API Key 连接');
    } finally {
      root?.unmount();
    }
  });
});
