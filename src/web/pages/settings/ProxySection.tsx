import React, { useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.js';
import { useIsMobile } from '../../components/useIsMobile.js';
import { useAnimatedVisibility } from '../../components/useAnimatedVisibility.js';
import ModernSelect from '../../components/ModernSelect.js';
import ResponsiveFormGrid from '../../components/ResponsiveFormGrid.js';
import ModelAvailabilityProbeConfirmModal from './ModelAvailabilityProbeConfirmModal.js';
import {
  createCodexDefaultHighReasoningVisualPreset,
  createVisualPayloadRule,
  isVisualPayloadRuleBlank,
  payloadRulesToVisualRules,
  type PayloadRuleAction,
  type VisualPayloadRule,
  type VisualPayloadRuleValueMode,
  visualRulesToPayloadRules,
} from './payloadRulesVisual.js';
import { PAYLOAD_RULE_PROTOCOL_OPTIONS } from './payloadRuleProtocolOptions.js';
import {
  PAYLOAD_RULES_EDITOR_SECTIONS,
  PAYLOAD_RULE_ACTION_OPTIONS,
  PAYLOAD_RULE_VALUE_MODE_OPTIONS,
  normalizePayloadRulesForEditor,
  parsePayloadRulesFromDrafts,
  type PayloadRulesEditorDrafts,
} from './payloadRulesEditor.js';
import type { SettingsData } from './settingsData.js';
import { getSettingsStyles } from './settingsStyles.js';

const MODEL_AVAILABILITY_PROBE_CONFIRM_TEXT = '我确认我使用的中转站全部允许批量测活，如因开启此功能被中转站封号，自行负责。';

type SystemProxyTestState =
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }
  | null;

export default function ProxySection({ data }: { data: SettingsData }) {
  const isMobile = useIsMobile();
  const styles = getSettingsStyles(isMobile);
  const {
    runtime,
    setRuntime,
    proxyErrorKeywordsText,
    setProxyErrorKeywordsText,
    payloadRules,
    setPayloadRules,
    savedModelAvailabilityProbeEnabled,
    setSavedModelAvailabilityProbeEnabled,
  } = data;
  const [savingSystemProxy, setSavingSystemProxy] = useState(false);
  const [testingSystemProxy, setTestingSystemProxy] = useState(false);
  const [systemProxyTestState, setSystemProxyTestState] = useState<SystemProxyTestState>(null);
  const [savingProxyFailureRules, setSavingProxyFailureRules] = useState(false);
  const [payloadVisualRules, setPayloadVisualRules] = useState<VisualPayloadRule[]>(
    () => payloadRulesToVisualRules(payloadRules),
  );
  const [payloadRuleDrafts, setPayloadRuleDrafts] = useState<PayloadRulesEditorDrafts>(
    () => normalizePayloadRulesForEditor(payloadRules),
  );
  const [payloadAdvancedDirty, setPayloadAdvancedDirty] = useState(false);
  const [savingPayloadRules, setSavingPayloadRules] = useState(false);
  const [showPayloadRulesEditor, setShowPayloadRulesEditor] = useState(false);
  const [savingProxyTransport, setSavingProxyTransport] = useState(false);
  const [savingCloak, setSavingCloak] = useState(false);
  const [savingModelAvailabilityProbe, setSavingModelAvailabilityProbe] = useState(false);
  const [modelAvailabilityProbeConfirmOpen, setModelAvailabilityProbeConfirmOpen] = useState(false);
  const modelAvailabilityProbeConfirmPresence = useAnimatedVisibility(modelAvailabilityProbeConfirmOpen, 220);
  const [modelAvailabilityProbeConfirmationInput, setModelAvailabilityProbeConfirmationInput] = useState('');
  const toast = useToast();

  const { inputStyle } = styles;

  const configuredPayloadRuleCount = useMemo(
    () => payloadVisualRules.filter((rule) => !isVisualPayloadRuleBlank(rule)).length,
    [payloadVisualRules],
  );

  const proxyTransportModeLabel = runtime.codexUpstreamWebsocketEnabled ? '上游 WebSocket 已启用' : 'HTTP 优先';
  const proxyTransportQueueLabel = `会话池 ${runtime.proxySessionChannelConcurrencyLimit} 并发 / ${runtime.proxySessionChannelQueueWaitMs}ms`;
  const modelAvailabilityProbeDirty = runtime.modelAvailabilityProbeEnabled !== savedModelAvailabilityProbeEnabled;
  const modelAvailabilityProbeStatusTone: 'neutral' | 'primary' | 'danger' | 'warning' = modelAvailabilityProbeDirty
    ? 'warning'
    : savedModelAvailabilityProbeEnabled
      ? 'danger'
      : 'neutral';
  const modelAvailabilityProbeStatusLabel = modelAvailabilityProbeDirty
    ? '待保存'
    : savedModelAvailabilityProbeEnabled
      ? '已启用'
      : '已关闭';

  const parseProxyErrorKeywords = (raw: string) => raw
    .split(/\r?\n|,/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const syncPayloadRuleDraftsFromObject = (value: unknown) => {
    setPayloadRuleDrafts(normalizePayloadRulesForEditor(value));
    setPayloadAdvancedDirty(false);
  };

  const syncPayloadVisualRulesFromObject = (value: unknown) => {
    setPayloadVisualRules(payloadRulesToVisualRules(value));
  };

  const applyVisualPayloadRules = (
    nextRulesOrUpdater: VisualPayloadRule[] | ((current: VisualPayloadRule[]) => VisualPayloadRule[]),
  ) => {
    setPayloadVisualRules((currentRules) => {
      const nextRules = typeof nextRulesOrUpdater === 'function'
        ? nextRulesOrUpdater(currentRules)
        : nextRulesOrUpdater;
      const serialized = visualRulesToPayloadRules(nextRules);
      if (serialized.success) {
        syncPayloadRuleDraftsFromObject(serialized.value);
      }
      return nextRules;
    });
  };

  const saveSystemProxy = async () => {
    setSavingSystemProxy(true);
    try {
      const res = await api.updateRuntimeSettings({
        systemProxyUrl: runtime.systemProxyUrl.trim(),
      });
      setRuntime((prev) => ({
        ...prev,
        systemProxyUrl: typeof res?.systemProxyUrl === 'string'
          ? res.systemProxyUrl
          : prev.systemProxyUrl,
      }));
      toast.success('系统代理已保存');
    } catch (err: any) {
      toast.error(err?.message || '保存失败');
    } finally {
      setSavingSystemProxy(false);
    }
  };

  const persistModelAvailabilityProbeSetting = async (enabled: boolean) => {
    setSavingModelAvailabilityProbe(true);
    try {
      const res = await api.updateRuntimeSettings({
        modelAvailabilityProbeEnabled: enabled,
      });
      const nextEnabled = typeof res?.modelAvailabilityProbeEnabled === 'boolean'
        ? res.modelAvailabilityProbeEnabled
        : enabled;
      setRuntime((prev) => ({
        ...prev,
        modelAvailabilityProbeEnabled: nextEnabled,
      }));
      setSavedModelAvailabilityProbeEnabled(nextEnabled);
      setModelAvailabilityProbeConfirmOpen(false);
      setModelAvailabilityProbeConfirmationInput('');
      toast.success(nextEnabled ? '批量测活已开启' : '批量测活已关闭');
    } catch (err: any) {
      toast.error(err?.message || '保存失败');
    } finally {
      setSavingModelAvailabilityProbe(false);
    }
  };

  const saveModelAvailabilityProbeSettings = async () => {
    if (runtime.modelAvailabilityProbeEnabled === savedModelAvailabilityProbeEnabled) {
      toast.info('批量测活设置未变化');
      return;
    }
    if (runtime.modelAvailabilityProbeEnabled) {
      setModelAvailabilityProbeConfirmOpen(true);
      return;
    }
    await persistModelAvailabilityProbeSetting(false);
  };

  const saveProxyTransportSettings = async () => {
    setSavingProxyTransport(true);
    try {
      const res = await api.updateRuntimeSettings({
        codexUpstreamWebsocketEnabled: runtime.codexUpstreamWebsocketEnabled,
        responsesCompactFallbackToResponsesEnabled: runtime.responsesCompactFallbackToResponsesEnabled,
        proxySessionChannelConcurrencyLimit: runtime.proxySessionChannelConcurrencyLimit,
        proxySessionChannelQueueWaitMs: runtime.proxySessionChannelQueueWaitMs,
      });
      setRuntime((prev) => ({
        ...prev,
        codexUpstreamWebsocketEnabled: typeof res?.codexUpstreamWebsocketEnabled === 'boolean'
          ? res.codexUpstreamWebsocketEnabled
          : prev.codexUpstreamWebsocketEnabled,
        responsesCompactFallbackToResponsesEnabled: typeof res?.responsesCompactFallbackToResponsesEnabled === 'boolean'
          ? res.responsesCompactFallbackToResponsesEnabled
          : prev.responsesCompactFallbackToResponsesEnabled,
        proxySessionChannelConcurrencyLimit: Number(res?.proxySessionChannelConcurrencyLimit) >= 0
          ? Math.trunc(Number(res.proxySessionChannelConcurrencyLimit))
          : prev.proxySessionChannelConcurrencyLimit,
        proxySessionChannelQueueWaitMs: Number(res?.proxySessionChannelQueueWaitMs) >= 0
          ? Math.trunc(Number(res.proxySessionChannelQueueWaitMs))
          : prev.proxySessionChannelQueueWaitMs,
      }));
      toast.success('传输与会话并发设置已保存');
    } catch (err: any) {
      toast.error(err?.message || '保存失败');
    } finally {
      setSavingProxyTransport(false);
    }
  };

  const saveCloakSettings = async () => {
    setSavingCloak(true);
    try {
      const res = await api.updateRuntimeSettings({
        claudeCodeCloakEnabled: runtime.claudeCodeCloakEnabled,
        codexCloakEnabled: runtime.codexCloakEnabled,
      });
      setRuntime((prev) => ({
        ...prev,
        claudeCodeCloakEnabled: typeof res?.claudeCodeCloakEnabled === 'boolean'
          ? res.claudeCodeCloakEnabled
          : prev.claudeCodeCloakEnabled,
        codexCloakEnabled: typeof res?.codexCloakEnabled === 'boolean'
          ? res.codexCloakEnabled
          : prev.codexCloakEnabled,
      }));
      toast.success('请求伪装设置已保存');
    } catch (err: any) {
      toast.error(err?.message || '保存失败');
    } finally {
      setSavingCloak(false);
    }
  };

  const testSystemProxy = async () => {
    const proxyUrl = runtime.systemProxyUrl.trim();
    if (!proxyUrl) {
      const message = '请先填写系统代理地址';
      setSystemProxyTestState({ kind: 'error', text: message });
      toast.info(message);
      return;
    }

    setTestingSystemProxy(true);
    setSystemProxyTestState(null);
    try {
      const res = await api.testSystemProxy({ proxyUrl });
      const summary = `连通成功，延迟 ${res.latencyMs} ms`;
      setSystemProxyTestState({ kind: 'success', text: summary });
      toast.success(`系统代理测试成功（${res.latencyMs} ms）`);
    } catch (err: any) {
      const message = err?.message || '系统代理测试失败';
      setSystemProxyTestState({ kind: 'error', text: message });
      toast.error(message);
    } finally {
      setTestingSystemProxy(false);
    }
  };

  const saveProxyFailureRules = async () => {
    setSavingProxyFailureRules(true);
    try {
      const keywords = parseProxyErrorKeywords(proxyErrorKeywordsText);
      const res = await api.updateRuntimeSettings({
        proxyErrorKeywords: keywords,
        proxyEmptyContentFailEnabled: runtime.proxyEmptyContentFailEnabled,
      });
      const nextKeywords = Array.isArray(res?.proxyErrorKeywords)
        ? res.proxyErrorKeywords
        : keywords;
      setRuntime((prev) => ({
        ...prev,
        proxyErrorKeywords: nextKeywords,
        proxyEmptyContentFailEnabled: typeof res?.proxyEmptyContentFailEnabled === 'boolean'
          ? res.proxyEmptyContentFailEnabled
          : prev.proxyEmptyContentFailEnabled,
      }));
      setProxyErrorKeywordsText(nextKeywords.join('\n'));
      toast.success('代理失败规则已保存');
    } catch (err: any) {
      toast.error(err?.message || '保存失败');
    } finally {
      setSavingProxyFailureRules(false);
    }
  };

  const savePayloadRules = async () => {
    const nextPayloadRules = payloadAdvancedDirty
      ? parsePayloadRulesFromDrafts(payloadRuleDrafts)
      : visualRulesToPayloadRules(payloadVisualRules);
    if (!nextPayloadRules.success) {
      toast.error(nextPayloadRules.message);
      return;
    }

    setSavingPayloadRules(true);
    try {
      const res = await api.updateRuntimeSettings({
        payloadRules: nextPayloadRules.value,
      });
      setPayloadRules(res?.payloadRules);
      syncPayloadRuleDraftsFromObject(res?.payloadRules);
      syncPayloadVisualRulesFromObject(res?.payloadRules);
      toast.success('Payload 规则已保存');
    } catch (err: any) {
      toast.error(err?.message || '保存 Payload 规则失败');
    } finally {
      setSavingPayloadRules(false);
    }
  };

  const applyCodexDefaultHighReasoningPreset = () => {
    applyVisualPayloadRules((currentRules) => [
      ...currentRules.filter((rule) => !isVisualPayloadRuleBlank(rule)),
      ...createCodexDefaultHighReasoningVisualPreset(),
    ]);
    setShowPayloadRulesEditor(true);
    toast.success('已填入 Codex 默认高推理预设');
  };

  const addPayloadVisualRule = () => {
    applyVisualPayloadRules((currentRules) => [
      ...currentRules,
      createVisualPayloadRule(),
    ]);
  };

  const updatePayloadVisualRule = (ruleId: string, patch: Partial<VisualPayloadRule>) => {
    applyVisualPayloadRules((currentRules) => currentRules.map((rule) => {
      if (rule.id !== ruleId) return rule;
      const nextAction = (patch.action ?? rule.action) as PayloadRuleAction;
      const nextValueMode = patch.valueMode ?? (
        nextAction === 'default-raw' || nextAction === 'override-raw'
          ? 'json'
          : rule.valueMode
      );
      return {
        ...rule,
        ...patch,
        action: nextAction,
        valueMode: nextAction === 'filter' ? 'text' : nextValueMode,
        value: nextAction === 'filter' ? '' : (patch.value ?? rule.value),
      };
    }));
  };

  const removePayloadVisualRule = (ruleId: string) => {
    applyVisualPayloadRules((currentRules) => currentRules.filter((rule) => rule.id !== ruleId));
  };

  const syncVisualRulesFromAdvancedJson = () => {
    const parsedPayloadRules = parsePayloadRulesFromDrafts(payloadRuleDrafts);
    if (!parsedPayloadRules.success) {
      toast.error(parsedPayloadRules.message);
      return;
    }
    syncPayloadVisualRulesFromObject(parsedPayloadRules.value);
    setPayloadAdvancedDirty(false);
    toast.success('已将高级 JSON 同步到可视化规则');
  };

  const closeModelAvailabilityProbeConfirmModal = () => {
    if (savingModelAvailabilityProbe) return;
    setModelAvailabilityProbeConfirmOpen(false);
  };

  const handleConfirmModelAvailabilityProbe = async () => {
    if (modelAvailabilityProbeConfirmationInput.trim() !== MODEL_AVAILABILITY_PROBE_CONFIRM_TEXT) return;
    await persistModelAvailabilityProbeSetting(true);
  };

  return (
    <div className="animate-fade-in">
      <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card animate-slide-up stagger-1" style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>系统代理</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            配置一个全局出站代理地址，站点页可按站点决定是否启用系统代理。
          </div>
          <input
            value={runtime.systemProxyUrl}
            onChange={(e) => {
              setRuntime((prev) => ({ ...prev, systemProxyUrl: e.target.value }));
              setSystemProxyTestState(null);
            }}
            placeholder="系统代理 URL（可选，如 http://127.0.0.1:7890 或 socks5://127.0.0.1:1080）"
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)', marginBottom: 10 }}
          />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={saveSystemProxy} disabled={savingSystemProxy} className="btn btn-primary">
              {savingSystemProxy ? <><span className="spinner spinner-sm" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }} /> 保存中...</> : '保存系统代理'}
            </button>
            <button
              onClick={testSystemProxy}
              disabled={testingSystemProxy}
              className="btn btn-ghost"
              style={{ border: '1px solid var(--color-border)' }}
            >
              {testingSystemProxy ? <><span className="spinner spinner-sm" /> 测试中...</> : '测试系统代理'}
            </button>
          </div>
          {systemProxyTestState && (
            <div
              style={{
                fontSize: 12,
                marginTop: 10,
                color: systemProxyTestState.kind === 'success'
                  ? 'var(--color-success)'
                  : 'var(--color-danger)',
              }}
            >
              {systemProxyTestState.text}
            </div>
          )}
        </div>

        <div className="card animate-slide-up stagger-2" style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>代理失败判定</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            命中任一关键词或空内容时判定失败，可触发重试。
          </div>
          <textarea
            value={proxyErrorKeywordsText}
            onChange={(e) => setProxyErrorKeywordsText(e.target.value)}
            placeholder="一行一个关键词，或逗号分隔"
            style={{
              ...inputStyle,
              fontFamily: 'var(--font-mono)',
              minHeight: 96,
              resize: 'vertical',
              marginBottom: 12,
            }}
          />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={runtime.proxyEmptyContentFailEnabled}
              onChange={(e) => setRuntime((prev) => ({ ...prev, proxyEmptyContentFailEnabled: e.target.checked }))}
            />
            空内容（completion=0，即使 prompt 有 token 也算）判定失败
          </label>
          <div>
            <button onClick={saveProxyFailureRules} disabled={savingProxyFailureRules} className="btn btn-primary">
              {savingProxyFailureRules ? <><span className="spinner spinner-sm" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }} /> 保存中...</> : '保存失败规则'}
            </button>
          </div>
        </div>

        <div className="card animate-slide-up stagger-3" style={styles.settingsModernCardStyle} data-settings-card="payload-rules">
          <div style={styles.settingsModernHeaderStyle}>
            <div style={styles.settingsModernTitleBlockStyle}>
              <div style={styles.settingsModernTitleStyle}>Payload 规则</div>
              <div style={styles.settingsModernDescriptionStyle}>
                对匹配模型的上游请求做默认注入、强制覆盖或字段过滤。规则结构参考 CPA 的 payload 配置，常见场景可直接注入
                {' '}
                <code style={{ fontFamily: 'var(--font-mono)' }}>reasoning.effort</code>
                {' '}
                之类的参数。
              </div>
            </div>
            <div style={styles.settingsModernPillRowStyle}>
              <span style={styles.getSettingsPillStyle(configuredPayloadRuleCount > 0 ? 'primary' : 'neutral')}>
                {configuredPayloadRuleCount > 0 ? `已配置 ${configuredPayloadRuleCount} 条` : '未配置'}
              </span>
              <span style={styles.getSettingsPillStyle(payloadAdvancedDirty ? 'warning' : 'neutral')}>
                {payloadAdvancedDirty ? '高级 JSON 待同步/保存' : '保存后立即生效'}
              </span>
            </div>
          </div>
          <div style={styles.settingsModernFieldCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                <div style={styles.settingsModernFieldLabelStyle}>常用预设</div>
                <div style={styles.settingsModernFieldHintStyle}>
                  先用预设快速填充，再通过下面的可视化规则编辑器细调。复杂场景仍可回退到高级 JSON。
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ border: '1px solid var(--color-border)' }}
                  onClick={applyCodexDefaultHighReasoningPreset}
                >
                  Codex 默认高推理
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ border: '1px solid var(--color-border)' }}
                  onClick={addPayloadVisualRule}
                >
                  新增规则
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ border: '1px solid var(--color-border)' }}
                  onClick={() => setShowPayloadRulesEditor((prev) => !prev)}
                >
                  {showPayloadRulesEditor ? '收起高级 JSON 编辑' : '展开高级 JSON 编辑'}
                </button>
              </div>
            </div>
          </div>
          {payloadVisualRules.length <= 0 ? (
            <div style={styles.settingsModernFieldCardStyle}>
              <div style={styles.settingsModernFieldLabelStyle}>还没有可视化规则</div>
              <div style={styles.settingsModernFieldHintStyle}>
                可以先点上面的预设，也可以直接新增一条规则：选择动作、协议、模型匹配、字段路径和值即可。
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {payloadVisualRules.map((rule, index) => (
                <div
                  key={rule.id}
                  style={styles.settingsModernFieldCardStyle}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div style={styles.settingsModernFieldLabelStyle}>规则 {index + 1}</div>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ border: '1px solid var(--color-border)', color: 'var(--color-danger)' }}
                      onClick={() => removePayloadVisualRule(rule.id)}
                    >
                      删除
                    </button>
                  </div>
                  <ResponsiveFormGrid columns={2}>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>动作</div>
                      <ModernSelect
                        size="sm"
                        data-testid={`payload-rule-action-${index + 1}`}
                        value={rule.action}
                        onChange={(value) => updatePayloadVisualRule(rule.id, { action: value as PayloadRuleAction })}
                        options={PAYLOAD_RULE_ACTION_OPTIONS}
                        placeholder="选择动作"
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>协议</div>
                      <ModernSelect
                        size="sm"
                        data-testid={`payload-rule-protocol-${index + 1}`}
                        value={rule.protocol}
                        onChange={(value) => updatePayloadVisualRule(rule.id, { protocol: String(value || '') })}
                        options={PAYLOAD_RULE_PROTOCOL_OPTIONS}
                        placeholder="全部协议"
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>模型匹配</div>
                      <input
                        type="text"
                        aria-label={`Payload 规则可视化模型 ${index + 1}`}
                        value={rule.modelPattern}
                        onChange={(e) => updatePayloadVisualRule(rule.id, { modelPattern: e.target.value })}
                        placeholder="例如 gpt-*"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>字段路径</div>
                      <input
                        type="text"
                        aria-label={`Payload 规则可视化路径 ${index + 1}`}
                        value={rule.path}
                        onChange={(e) => updatePayloadVisualRule(rule.id, { path: e.target.value })}
                        placeholder="例如 reasoning.effort"
                        style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                  </ResponsiveFormGrid>
                  {rule.action === 'filter' ? (
                    <div style={styles.settingsModernFieldHintStyle}>
                      删除字段规则不需要填写值，命中后会从请求中移除这条路径。
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {(rule.action === 'default' || rule.action === 'override') && (
                        <div style={{ width: isMobile ? '100%' : 180 }}>
                          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>值类型</div>
                          <ModernSelect
                            size="sm"
                            data-testid={`payload-rule-value-mode-${index + 1}`}
                            value={rule.valueMode}
                            onChange={(value) => updatePayloadVisualRule(rule.id, {
                              valueMode: value as VisualPayloadRuleValueMode,
                              value: value === 'json' && rule.valueMode !== 'json'
                                ? (rule.value ? JSON.stringify(rule.value) : '')
                                : rule.value,
                            })}
                            options={PAYLOAD_RULE_VALUE_MODE_OPTIONS}
                            placeholder="值类型"
                          />
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                          {rule.action === 'default-raw' || rule.action === 'override-raw'
                            ? '原始 JSON 值'
                            : (rule.valueMode === 'json' ? 'JSON 值' : '文本值')}
                        </div>
                        {(rule.action === 'default-raw' || rule.action === 'override-raw' || rule.valueMode === 'json') ? (
                          <textarea
                            aria-label={`Payload 规则可视化值 ${index + 1}`}
                            value={rule.value}
                            onChange={(e) => updatePayloadVisualRule(rule.id, { value: e.target.value })}
                            placeholder={rule.action === 'default-raw' || rule.action === 'override-raw'
                              ? '{"type":"json_schema"}'
                              : '{"effort":"high"}'}
                            rows={3}
                            style={{
                              ...inputStyle,
                              minHeight: 88,
                              fontFamily: 'var(--font-mono)',
                              lineHeight: 1.6,
                              resize: 'vertical',
                            }}
                          />
                        ) : (
                          <input
                            type="text"
                            aria-label={`Payload 规则可视化值 ${index + 1}`}
                            value={rule.value}
                            onChange={(e) => updatePayloadVisualRule(rule.id, { value: e.target.value })}
                            placeholder="例如 high"
                            style={inputStyle}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className={`anim-collapse ${showPayloadRulesEditor ? 'is-open' : ''}`.trim()}>
            <div className="anim-collapse-inner" style={{ paddingTop: 2 }}>
              <div style={styles.settingsModernFieldCardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={styles.settingsModernFieldLabelStyle}>高级 JSON 编辑</div>
                    <div style={styles.settingsModernFieldHintStyle}>
                      适合直接粘贴 CPA 风格规则。手动改完后，可点击“同步到可视化规则”回到上面的低门槛编辑器。
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ border: '1px solid var(--color-border)' }}
                    onClick={syncVisualRulesFromAdvancedJson}
                  >
                    同步到可视化规则
                  </button>
                </div>
              </div>
              <ResponsiveFormGrid columns={2}>
                {PAYLOAD_RULES_EDITOR_SECTIONS.map((section) => (
                  <div key={section.key} style={styles.settingsModernFieldCardStyle}>
                    <div style={styles.settingsModernFieldLabelStyle}>{section.title}</div>
                    <div style={styles.settingsModernFieldHintStyle}>{section.description}</div>
                    <textarea
                      aria-label={`Payload 规则 ${section.key}`}
                      value={payloadRuleDrafts[section.key]}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setPayloadRuleDrafts((prev) => ({
                          ...prev,
                          [section.key]: nextValue,
                        }));
                        setPayloadAdvancedDirty(true);
                      }}
                      placeholder={section.placeholder}
                      rows={6}
                      style={{
                        ...inputStyle,
                        minHeight: 144,
                        fontFamily: 'var(--font-mono)',
                        lineHeight: 1.6,
                        resize: 'vertical',
                      }}
                    />
                  </div>
                ))}
              </ResponsiveFormGrid>
            </div>
          </div>
          <div style={styles.settingsModernActionsStyle}>
            <button onClick={savePayloadRules} disabled={savingPayloadRules} className="btn btn-primary">
              {savingPayloadRules ? <><span className="spinner spinner-sm" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }} /> 保存中...</> : '保存 Payload 规则'}
            </button>
          </div>
        </div>

        <div className="card animate-slide-up stagger-4" style={styles.settingsModernCardStyle} data-settings-card="proxy-transport">
          <div style={styles.settingsModernHeaderStyle}>
            <div style={styles.settingsModernTitleBlockStyle}>
              <div style={styles.settingsModernTitleStyle}>Codex 上游传输与会话并发</div>
              <div style={styles.settingsModernDescriptionStyle}>
                默认采用 HTTP 优先。只有这里开启后，metapi 才会在 Codex 请求上尝试把上游升级为 WebSocket。下游 Codex 客户端也必须同时启用 `/v1/responses` websocket，单开这里不会生效。
              </div>
            </div>
            <div style={styles.settingsModernPillRowStyle}>
              <span style={styles.getSettingsPillStyle(runtime.codexUpstreamWebsocketEnabled ? 'primary' : 'neutral')}>
                {proxyTransportModeLabel}
              </span>
              <span style={styles.getSettingsPillStyle('neutral')}>
                {proxyTransportQueueLabel}
              </span>
            </div>
          </div>
          <label style={styles.settingsModernToggleStyle}>
            <div style={styles.settingsModernToggleCopyStyle}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>允许 metapi 到 Codex 上游使用 WebSocket</span>
              <span style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
                仅在下游 Codex 客户端已同步开启 `/v1/responses` websocket 时启用；否则仍按 HTTP 优先执行。
              </span>
            </div>
            <input
              type="checkbox"
              checked={runtime.codexUpstreamWebsocketEnabled}
              onChange={(e) => setRuntime((prev) => ({ ...prev, codexUpstreamWebsocketEnabled: e.target.checked }))}
              style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }}
            />
          </label>
          <label style={styles.settingsModernToggleStyle}>
            <div style={styles.settingsModernToggleCopyStyle}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Compact 明确不支持时回退到普通 Responses</span>
              <span style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
                仅对 `/v1/responses/compact` 生效。当上游明确返回 compact 不支持时，允许自动回退到普通 `/responses`。
              </span>
            </div>
            <input
              type="checkbox"
              checked={runtime.responsesCompactFallbackToResponsesEnabled}
              onChange={(e) => setRuntime((prev) => ({ ...prev, responsesCompactFallbackToResponsesEnabled: e.target.checked }))}
              style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }}
            />
          </label>
          <ResponsiveFormGrid columns={2}>
            <div style={styles.settingsModernFieldCardStyle}>
              <div style={styles.settingsModernFieldLabelStyle}>会话通道并发上限</div>
              <input
                type="number"
                min={0}
                value={runtime.proxySessionChannelConcurrencyLimit}
                onChange={(e) => {
                  const nextValue = Number(e.target.value);
                  setRuntime((prev) => ({
                    ...prev,
                    proxySessionChannelConcurrencyLimit: Number.isFinite(nextValue) && nextValue >= 0
                      ? Math.trunc(nextValue)
                      : prev.proxySessionChannelConcurrencyLimit,
                  }));
                }}
                style={inputStyle}
              />
              <div style={styles.settingsModernFieldHintStyle}>
                只作用于能识别稳定 `session_id` 的会话型请求；普通请求不会进入这组 lease 池。
              </div>
            </div>
            <div style={styles.settingsModernFieldCardStyle}>
              <div style={styles.settingsModernFieldLabelStyle}>排队等待时间（毫秒）</div>
              <input
                type="number"
                min={0}
                step={100}
                value={runtime.proxySessionChannelQueueWaitMs}
                onChange={(e) => {
                  const nextValue = Number(e.target.value);
                  setRuntime((prev) => ({
                    ...prev,
                    proxySessionChannelQueueWaitMs: Number.isFinite(nextValue) && nextValue >= 0
                      ? Math.trunc(nextValue)
                      : prev.proxySessionChannelQueueWaitMs,
                  }));
                }}
                style={inputStyle}
              />
              <div style={styles.settingsModernFieldHintStyle}>
                超过该时间仍拿不到会话通道时，本次请求会直接放弃排队，避免长期挂起。
              </div>
            </div>
          </ResponsiveFormGrid>
          <div style={styles.settingsModernActionsStyle}>
            <button onClick={saveProxyTransportSettings} disabled={savingProxyTransport} className="btn btn-primary">
              {savingProxyTransport ? <><span className="spinner spinner-sm" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }} /> 保存中...</> : '保存传输与并发'}
            </button>
          </div>
        </div>

        <div className="card animate-slide-up stagger-5" style={styles.settingsModernCardStyle} data-settings-card="request-cloak">
          <div style={styles.settingsModernHeaderStyle}>
            <div style={styles.settingsModernTitleBlockStyle}>
              <div style={styles.settingsModernTitleStyle}>请求伪装</div>
              <div style={styles.settingsModernDescriptionStyle}>
                对非官方 CLI 客户端，把上游请求改写成 Claude Code / Codex CLI 的格式。账号编辑面板可按账号覆盖这里的全局默认值。
              </div>
            </div>
            <div style={styles.settingsModernPillRowStyle}>
              <span style={styles.getSettingsPillStyle(runtime.claudeCodeCloakEnabled || runtime.codexCloakEnabled ? 'primary' : 'neutral')}>
                {runtime.claudeCodeCloakEnabled || runtime.codexCloakEnabled ? '已启用' : '默认关闭'}
              </span>
            </div>
          </div>
          <label style={styles.settingsModernToggleStyle}>
            <div style={styles.settingsModernToggleCopyStyle}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>以 Claude Code CLI 伪装请求</span>
              <span style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
                检测到下游不是官方 Claude Code 客户端时，把请求头与指令改写为 Claude Code 格式。
              </span>
            </div>
            <input
              type="checkbox"
              checked={runtime.claudeCodeCloakEnabled}
              onChange={(e) => setRuntime((prev) => ({ ...prev, claudeCodeCloakEnabled: e.target.checked }))}
              style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }}
            />
          </label>
          <label style={styles.settingsModernToggleStyle}>
            <div style={styles.settingsModernToggleCopyStyle}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>以 Codex CLI 伪装请求</span>
              <span style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
                检测到下游不是官方 Codex 客户端时，注入 Codex CLI 标识与指令前缀。
              </span>
            </div>
            <input
              type="checkbox"
              checked={runtime.codexCloakEnabled}
              onChange={(e) => setRuntime((prev) => ({ ...prev, codexCloakEnabled: e.target.checked }))}
              style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }}
            />
          </label>
          <div style={styles.settingsModernActionsStyle}>
            <button onClick={saveCloakSettings} disabled={savingCloak} className="btn btn-primary">
              {savingCloak ? <><span className="spinner spinner-sm" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }} /> 保存中...</> : '保存伪装设置'}
            </button>
          </div>
        </div>

        <div className="card animate-slide-up stagger-6" style={styles.settingsModernDangerCardStyle} data-settings-card="model-availability-probe">
          <div style={styles.settingsModernHeaderStyle}>
            <div style={styles.settingsModernTitleBlockStyle}>
              <div style={{ ...styles.settingsModernTitleStyle, color: 'var(--color-danger)' }}>批量测活</div>
              <div style={styles.settingsModernDescriptionStyle}>
                默认关闭。开启后，metapi 会在后台定时对活跃账号模型发送最小化探测请求，用来校正“/models 能看到但实际不可用”的假阳性。
              </div>
            </div>
            <div style={styles.settingsModernPillRowStyle}>
              <span style={styles.getSettingsPillStyle(modelAvailabilityProbeStatusTone)}>
                {modelAvailabilityProbeStatusLabel}
              </span>
              <span style={styles.getSettingsPillStyle('danger')}>
                高风险操作
              </span>
            </div>
          </div>
          <div
            style={{
              ...styles.settingsModernCalloutStyle,
              borderColor: 'color-mix(in srgb, var(--color-danger) 18%, var(--color-border-light))',
              background: 'color-mix(in srgb, var(--color-danger-soft) 38%, var(--color-bg-card))',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-danger)' }}>风险提示</div>
            <div style={{ fontSize: 12, lineHeight: 1.75, color: 'var(--color-text-secondary)' }}>
              只有在你确认自己使用的中转站明确允许批量测活时才应该开启。若上游不允许，这类探测可能带来封号或风控风险。
            </div>
          </div>
          <label style={styles.settingsModernToggleStyle}>
            <div style={styles.settingsModernToggleCopyStyle}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>允许 metapi 后台主动批量测活</span>
              <span style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
                首次从关闭切换到开启时，需要手动输入确认语句；关闭时可直接保存。
              </span>
            </div>
            <input
              type="checkbox"
              checked={runtime.modelAvailabilityProbeEnabled}
              onChange={(e) => setRuntime((prev) => ({ ...prev, modelAvailabilityProbeEnabled: e.target.checked }))}
              style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }}
            />
          </label>
          <ResponsiveFormGrid columns={2}>
            <div style={styles.settingsModernFieldCardStyle}>
              <div style={styles.settingsModernFieldLabelStyle}>当前生效状态</div>
              <div style={styles.settingsModernPillRowStyle}>
                <span style={styles.getSettingsPillStyle(modelAvailabilityProbeStatusTone)}>
                  {modelAvailabilityProbeStatusLabel}
                </span>
              </div>
              <div style={styles.settingsModernFieldHintStyle}>
                {savedModelAvailabilityProbeEnabled
                  ? '后台会定时执行最小化探测请求，用于校正模型可用性。'
                  : '后台不会主动发起模型可用性探测请求。'}
              </div>
            </div>
            <div style={styles.settingsModernFieldCardStyle}>
              <div style={styles.settingsModernFieldLabelStyle}>启用门槛</div>
              <div style={{ ...styles.settingsModernFieldHintStyle, marginTop: 0 }}>
                首次开启必须手动输入确认语句，避免误把高风险探测当成普通开关。
              </div>
            </div>
          </ResponsiveFormGrid>
          <div style={styles.settingsModernActionsStyle}>
            <button onClick={saveModelAvailabilityProbeSettings} disabled={savingModelAvailabilityProbe} className="btn btn-primary">
              {savingModelAvailabilityProbe ? <><span className="spinner spinner-sm" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }} /> 保存中...</> : '保存批量测活设置'}
            </button>
          </div>
        </div>
      </div>
      <ModelAvailabilityProbeConfirmModal
        presence={modelAvailabilityProbeConfirmPresence}
        confirmText={MODEL_AVAILABILITY_PROBE_CONFIRM_TEXT}
        confirmationInput={modelAvailabilityProbeConfirmationInput}
        saving={savingModelAvailabilityProbe}
        onConfirmationInputChange={setModelAvailabilityProbeConfirmationInput}
        onClose={closeModelAvailabilityProbeConfirmModal}
        onConfirm={handleConfirmModelAvailabilityProbe}
      />
    </div>
  );
}
