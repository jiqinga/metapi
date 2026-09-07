import React, { useMemo, useState } from 'react';
import CenteredModal from '../../components/CenteredModal.js';

const ALL_PROTOCOLS = ['chat', 'messages', 'responses'] as const;
type ProtocolOption = (typeof ALL_PROTOCOLS)[number];

type AccountModelRow = {
  name: string;
  latencyMs: number | null;
  disabled: boolean;
  isManual?: boolean;
  protocols?: string[];
  manualProtocols?: string[] | null;
  effectiveProtocols?: string[];
};

type AccountModelModalState = {
  open: boolean;
  account: any | null;
  models: AccountModelRow[];
  pendingDisabled: Set<string>;
  siteDisabledModels: Set<string>;
  loading: boolean;
  saving: boolean;
  siteName: string;
  manualModelsInput: string;
  addingManualModels: boolean;
  pendingProtocolOverrides: Map<string, string[] | null>;
  expandedProtocolModel: string | null;
  savingProtocols: boolean;
};

type AccountModelsModalProps = {
  modelModal: AccountModelModalState;
  inputStyle: React.CSSProperties;
  onClose: () => void;
  onSave: () => void;
  onRefresh: () => Promise<void> | void;
  onToggleModelDisabled: (modelName: string) => void;
  onSetPendingDisabled: (pendingDisabled: Set<string>) => void;
  onManualInputChange: (value: string) => void;
  onAddManualModels: () => Promise<void> | void;
  onRemoveManualModel?: (modelName: string) => Promise<void> | void;
  onToggleProtocolOverride: (modelName: string, protocol: ProtocolOption) => void;
  onResetProtocolOverride: (modelName: string) => void;
  onToggleProtocolEditor: (modelName: string) => void;
  onSaveProtocols: () => Promise<void> | void;
};

export default function AccountModelsModal({
  modelModal,
  inputStyle,
  onClose,
  onSave,
  onRefresh,
  onToggleModelDisabled,
  onSetPendingDisabled,
  onManualInputChange,
  onAddManualModels,
  onRemoveManualModel,
  onToggleProtocolOverride,
  onResetProtocolOverride,
  onToggleProtocolEditor,
  onSaveProtocols,
}: AccountModelsModalProps) {
  const [modelFilter, setModelFilter] = useState('');
  const visibleModels = useMemo(() => {
    const keyword = modelFilter.trim().toLowerCase();
    if (!keyword) return modelModal.models;
    return modelModal.models.filter((model) => model.name.toLowerCase().includes(keyword));
  }, [modelModal.models, modelFilter]);

  // Effective disabled = site-wide list (read-only here) + connection-level toggles
  const siteDisabledSet = modelModal.siteDisabledModels;
  const isModelEffectiveDisabled = (name: string) => siteDisabledSet.has(name) || modelModal.pendingDisabled.has(name);
  const effectiveDisabledCount = modelModal.models.reduce(
    (acc, model) => acc + (isModelEffectiveDisabled(model.name) ? 1 : 0),
    0,
  );
  return (
    <CenteredModal
      open={modelModal.open}
      onClose={onClose}
      title={modelModal.siteName ? `模型管理 · ${modelModal.siteName}` : '模型管理'}
      maxWidth={640}
      footer={(
        <>
          <button onClick={onClose} className="btn btn-ghost">取消</button>
          <button
            onClick={onSave}
            disabled={modelModal.saving || modelModal.loading}
            className="btn btn-primary"
          >
            {modelModal.saving ? <><span className="spinner spinner-sm" />保存中...</> : '保存'}
          </button>
        </>
      )}
    >
      {modelModal.loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 10 }}>
          <span className="spinner" />
          <span style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>加载模型列表...</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {modelModal.models.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🤖</div>
              <div style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 8 }}>暂无可用模型</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16 }}>请先点击账号操作栏中的「刷新」或「模型」按钮获取模型</div>
              <button
                onClick={() => void onRefresh()}
                className="btn btn-soft-primary"
              >
                立即获取模型
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={modelModal.models.length > 0 && effectiveDisabledCount === 0}
                    ref={(el) => {
                      if (el) {
                        const total = modelModal.models.length;
                        el.indeterminate = effectiveDisabledCount > 0 && effectiveDisabledCount < total;
                      }
                    }}
                    onChange={() => {
                      if (effectiveDisabledCount === 0) {
                        // Disable everything this connection can disable; site-level
                        // entries are managed from site settings and stay untouched.
                        onSetPendingDisabled(new Set(
                          modelModal.models
                            .filter((model) => !siteDisabledSet.has(model.name))
                            .map((model) => model.name),
                        ));
                      } else {
                        onSetPendingDisabled(new Set());
                      }
                    }}
                    style={{ accentColor: 'var(--color-primary)', width: 15, height: 15 }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                    已启用 <strong style={{ color: 'var(--color-text-primary)' }}>{modelModal.models.length - effectiveDisabledCount}</strong> / {modelModal.models.length} 个模型
                  </span>
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => void onRefresh()}
                    disabled={modelModal.saving}
                    className="btn btn-ghost"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                  >
                    刷新模型
                  </button>
                  <button
                    onClick={() => {
                      // Invert the connection-level toggles only; site-level
                      // disabled rows are read-only here and stay disabled.
                      const next = new Set<string>();
                      for (const model of modelModal.models) {
                        if (siteDisabledSet.has(model.name)) continue;
                        if (!modelModal.pendingDisabled.has(model.name)) next.add(model.name);
                      }
                      onSetPendingDisabled(next);
                    }}
                    className="btn btn-ghost"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                  >
                    反选
                  </button>
                  <button
                    onClick={() => onSetPendingDisabled(new Set(
                      modelModal.models
                        .filter((model) => !siteDisabledSet.has(model.name))
                        .map((model) => model.name),
                    ))}
                    className="btn btn-ghost"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                  >
                    全部禁用
                  </button>
                  <button
                    onClick={() => onSetPendingDisabled(new Set())}
                    className="btn btn-ghost"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                  >
                    全部启用
                  </button>
                </div>
              </div>

              {modelModal.pendingProtocolOverrides.size > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    {modelModal.pendingProtocolOverrides.size} 个模型协议待保存
                  </span>
                  <button
                    onClick={() => void onSaveProtocols()}
                    disabled={modelModal.savingProtocols}
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: 12, padding: '4px 12px' }}
                  >
                    {modelModal.savingProtocols ? <><span className="spinner spinner-sm" />保存协议...</> : '保存协议设置'}
                  </button>
                </div>
              )}

              <div className="toolbar-search" style={{ maxWidth: '100%' }}>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={modelFilter}
                  onChange={(e) => setModelFilter(e.target.value)}
                  placeholder="搜索模型"
                />
              </div>

              <div style={{
                maxHeight: 320,
                overflowY: 'auto',
                border: '1px solid var(--color-border-light)',
                borderRadius: 'var(--radius-sm)',
              }}>
                {visibleModels.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                    暂无匹配模型
                  </div>
                ) : visibleModels.map((model, idx) => {
                  const isSiteDisabled = siteDisabledSet.has(model.name);
                  const isDisabled = isSiteDisabled || modelModal.pendingDisabled.has(model.name);
                  const isExpanded = modelModal.expandedProtocolModel === model.name;
                  const pendingOverride = modelModal.pendingProtocolOverrides.get(model.name);
                  const hasPendingOverride = pendingOverride !== undefined;
                  // pendingOverride is string[] | null; null means "reset to auto"
                  const overrideValue = hasPendingOverride
                    ? pendingOverride
                    : model.manualProtocols ?? null;
                  const isManualOverride = overrideValue !== null;
                  const displayProtocols = isManualOverride
                    ? (overrideValue as string[])
                    : (model.protocols ?? []);
                  return (
                    <div
                      key={model.name}
                      style={{
                        borderBottom: idx < visibleModels.length - 1 ? '1px solid var(--color-border-light)' : undefined,
                      }}
                    >
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '9px 14px',
                          cursor: 'pointer',
                          background: isDisabled ? 'var(--color-bg)' : undefined,
                          opacity: isDisabled ? 0.55 : 1,
                          transition: 'opacity 0.15s, background 0.15s',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={!isDisabled}
                          disabled={isSiteDisabled}
                          onChange={() => onToggleModelDisabled(model.name)}
                          title={isSiteDisabled ? '站点级禁用，对整站生效；请在站点管理中调整' : undefined}
                          style={{ accentColor: 'var(--color-primary)', width: 15, height: 15, flexShrink: 0 }}
                        />
                        <span style={{ flex: 1, fontSize: 13, fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                          {model.name}
                        </span>
                        {displayProtocols && displayProtocols.length > 0 ? (
                          <span style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                            {displayProtocols.map((proto) => {
                              const colorClass =
                                proto === 'chat' ? 'badge-success'
                                : proto === 'messages' ? 'badge-warning'
                                : proto === 'responses' ? 'badge-info'
                                : 'badge-muted';
                              return (
                                <span
                                  key={proto}
                                  className={`badge ${colorClass}`}
                                  style={{
                                    fontSize: 10,
                                    padding: '1px 5px',
                                    fontWeight: 500,
                                    ...(isManualOverride ? { boxShadow: '0 0 0 1.5px currentColor inset' } : {}),
                                  }}
                                  title={isManualOverride ? '手动指定协议' : '自动检测协议'}
                                >
                                  {proto}
                                </span>
                              );
                            })}
                          </span>
                        ) : null}
                        {model.latencyMs != null ? (
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0 }}>
                            {model.latencyMs}ms
                          </span>
                        ) : null}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onToggleProtocolEditor(model.name);
                          }}
                          className="btn btn-ghost btn-xs"
                          style={{ fontSize: 10, padding: '2px 6px', flexShrink: 0 }}
                          title="指定协议"
                        >
                          {isManualOverride ? '自定义' : '协议'}
                        </button>
                        {model.isManual ? (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void onRemoveManualModel?.(model.name);
                            }}
                            className="btn btn-ghost btn-xs"
                            style={{ fontSize: 10, padding: '2px 6px', color: 'var(--color-error)', flexShrink: 0 }}
                            title="删除手动添加的模型"
                          >
                            ✕
                          </button>
                        ) : null}
                        {isSiteDisabled ? (
                          <span
                            className="badge badge-warning"
                            style={{ fontSize: 10, flexShrink: 0 }}
                            title="站点级禁用，对整站生效；请在站点管理中调整"
                          >
                            站点禁用
                          </span>
                        ) : isDisabled ? (
                          <span className="badge badge-error" style={{ fontSize: 10, flexShrink: 0 }}>禁用</span>
                        ) : null}
                      </label>
                      {isExpanded ? (
                        <div style={{ padding: '0 14px 10px 44px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>指定协议：</span>
                          {ALL_PROTOCOLS.map((proto) => {
                            const checked = isManualOverride && (overrideValue as string[]).includes(proto);
                            return (
                              <label key={proto} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12 }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => onToggleProtocolOverride(model.name, proto)}
                                  style={{ accentColor: 'var(--color-primary)', width: 13, height: 13 }}
                                />
                                {proto}
                              </label>
                            );
                          })}
                          <button
                            onClick={() => onResetProtocolOverride(model.name)}
                            className="btn btn-ghost btn-xs"
                            style={{ fontSize: 11, padding: '2px 8px' }}
                            title="取消手动指定，恢复自动选择"
                          >
                            继承自动
                          </button>
                          {isManualOverride && (overrideValue as string[]).length === 0 ? (
                            <span style={{ fontSize: 11, color: 'var(--color-warning)' }}>至少选一个协议，否则将回退自动</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.6 }}>
                💡 禁用的模型仅对当前连接生效，同一站点下其他连接不受影响；如需整站禁用，请在站点管理中配置。
                <br />
                💡 带「站点禁用」标签的模型为站点级禁用（对整站生效），此处仅可查看，需在站点管理中调整。
                <br />
                💡 点击「协议」可手动指定该模型的上游协议（蓝色标签为手动指定，灰色为自动检测）。手动指定后自动协议选择对该模型失效。
              </div>
            </>
          )}

          <div style={{ marginTop: 16, padding: '12px', background: 'var(--color-bg)', border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--color-text-primary)' }}>手动添加可用模型</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
              如果您的账号支持某些未在上方列表中显示的模型，可以在此手动添加（多个以英文逗号分隔）。
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                placeholder="例如: gpt-4-custom, claude-3-5-sonnet-20241022"
                value={modelModal.manualModelsInput}
                onChange={(e) => onManualInputChange(e.target.value)}
                style={{ ...inputStyle, flex: 1, fontFamily: 'var(--font-mono)' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !modelModal.addingManualModels) {
                    void onAddManualModels();
                  }
                }}
              />
              <button
                disabled={!modelModal.manualModelsInput.trim() || modelModal.addingManualModels}
                onClick={() => void onAddManualModels()}
                className="btn btn-primary btn-sm"
                style={{ whiteSpace: 'nowrap' }}
              >
                {modelModal.addingManualModels ? <span className="spinner spinner-sm" /> : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </CenteredModal>
  );
}
