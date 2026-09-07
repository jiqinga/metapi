import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import AccountModelsModal from './accounts/AccountModelsModal.js';

function collectText(node: ReactTestInstance): string {
  const children = node.children || [];
  return children.map((child) => {
    if (typeof child === 'string') return child;
    return collectText(child);
  }).join('');
}

function findAllText(node: ReactTestInstance, acc: string[] = []): string[] {
  const children = node.children || [];
  const text = children.filter((child): child is string => typeof child === 'string').join('');
  if (text.trim()) acc.push(text.trim());
  for (const child of children) {
    if (typeof child !== 'string') findAllText(child, acc);
  }
  return acc;
}

const MODEL_NAMES = [
  'gpt-4o',
  'gpt-4o-mini',
  'claude-sonnet-4-5',
  'claude-opus-4-1',
  'gemini-2.5-pro',
];

function buildModelModal(siteDisabledModels: Set<string> = new Set()) {
  return {
    open: true,
    account: { id: 1, siteId: 1 },
    models: MODEL_NAMES.map((name) => ({
      name,
      latencyMs: null,
      disabled: false,
      protocols: [] as string[],
    })),
    pendingDisabled: new Set<string>(),
    siteDisabledModels,
    loading: false,
    saving: false,
    siteName: 'Demo Site',
    manualModelsInput: '',
    addingManualModels: false,
    pendingProtocolOverrides: new Map<string, string[] | null>(),
    expandedProtocolModel: null,
    savingProtocols: false,
  };
}

function buildProps() {
  return {
    modelModal: buildModelModal(),
    inputStyle: {},
    onClose: vi.fn(),
    onSave: vi.fn(),
    onRefresh: vi.fn(),
    onToggleModelDisabled: vi.fn(),
    onSetPendingDisabled: vi.fn(),
    onManualInputChange: vi.fn(),
    onAddManualModels: vi.fn(),
    onToggleProtocolOverride: vi.fn(),
    onResetProtocolOverride: vi.fn(),
    onToggleProtocolEditor: vi.fn(),
    onSaveProtocols: vi.fn(),
  };
}

async function renderModal() {
  const props = buildProps();
  let root!: ReturnType<typeof create>;
  await act(async () => {
    root = create(<AccountModelsModal {...props} />);
  });
  return { root, props };
}

describe('AccountModelsModal model search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders every model row when no search keyword is entered', async () => {
    const { root } = await renderModal();

    const texts = findAllText(root.root);
    for (const name of MODEL_NAMES) {
      expect(texts).toContain(name);
    }
  });

  it('narrows the visible rows to keyword matches (case-insensitive)', async () => {
    const { root } = await renderModal();

    const searchInput = root.root.find((node: ReactTestInstance) => (
      node.type === 'input'
      && node.props.placeholder === '搜索模型'
    ));

    await act(async () => {
      searchInput.props.onChange({ target: { value: 'CLAUDE' } });
    });

    const texts = findAllText(root.root);
    expect(texts).toContain('claude-sonnet-4-5');
    expect(texts).toContain('claude-opus-4-1');
    expect(texts).not.toContain('gpt-4o');
    expect(texts).not.toContain('gemini-2.5-pro');
  });

  it('shows an empty hint for no matches while bulk actions keep covering all models', async () => {
    const { root, props } = await renderModal();

    const searchInput = root.root.find((node: ReactTestInstance) => (
      node.type === 'input'
      && node.props.placeholder === '搜索模型'
    ));

    await act(async () => {
      searchInput.props.onChange({ target: { value: 'nonexistent-model' } });
    });

    expect(collectText(root.root)).toContain('暂无匹配模型');

    const disableAllButton = root.root.find((node: ReactTestInstance) => (
      node.type === 'button'
      && typeof node.props.onClick === 'function'
      && collectText(node).trim() === '全部禁用'
    ));
    await act(async () => {
      disableAllButton.props.onClick();
    });

    expect(props.onSetPendingDisabled.mock.calls[0][0]).toEqual(new Set(MODEL_NAMES));
  });

  it('marks site-level disabled models read-only with a dedicated badge', async () => {
    const siteDisabled = new Set(['gpt-4o']);
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<AccountModelsModal {...buildProps()} modelModal={buildModelModal(siteDisabled)} />);
    });

    expect(collectText(root.root)).toContain('站点禁用');

    const siteRowCheckbox = root.root.find((node: ReactTestInstance) => (
      node.type === 'input'
      && node.props.type === 'checkbox'
      && typeof node.props.onChange === 'function'
      && collectText(node.parent!).includes('gpt-4o')
      && node.props.disabled === true
    ));
    expect(siteRowCheckbox).toBeTruthy();

    const toggleableCheckbox = root.root.find((node: ReactTestInstance) => (
      node.type === 'input'
      && node.props.type === 'checkbox'
      && typeof node.props.onChange === 'function'
      && collectText(node.parent!).includes('claude-sonnet-4-5')
    ));
    expect(toggleableCheckbox.props.disabled).toBeFalsy();
  });

  it('keeps site-level disabled models out of the connection-level disable list on 全部禁用', async () => {
    const siteDisabled = new Set(['gpt-4o']);
    const props = buildProps();
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<AccountModelsModal {...props} modelModal={buildModelModal(siteDisabled)} />);
    });

    const disableAllButton = root.root.find((node: ReactTestInstance) => (
      node.type === 'button'
      && typeof node.props.onClick === 'function'
      && collectText(node).trim() === '全部禁用'
    ));
    await act(async () => {
      disableAllButton.props.onClick();
    });

    const passed = props.onSetPendingDisabled.mock.calls[0][0] as Set<string>;
    expect(passed).toEqual(new Set(MODEL_NAMES.filter((name) => name !== 'gpt-4o')));
    expect(passed.has('gpt-4o')).toBe(false);
  });
});
