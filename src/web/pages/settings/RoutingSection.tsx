import React, { useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.js';
import { useIsMobile } from '../../components/useIsMobile.js';
import ModernSelect from '../../components/ModernSelect.js';
import {
  applyRoutingProfilePreset,
  resolveRoutingProfilePreset,
  type RoutingWeights,
} from '../helpers/routingProfiles.js';
import { ROUTE_COOLDOWN_UNIT_OPTIONS, toRouteCooldownSeconds, type RouteCooldownUnit } from './settingsData.js';
import type { SettingsData } from './settingsData.js';
import { getSettingsStyles } from './settingsStyles.js';

export default function RoutingSection({ data }: { data: SettingsData }) {
  const isMobile = useIsMobile();
  const styles = getSettingsStyles(isMobile);
  const {
    runtime,
    setRuntime,
    blockedBrands,
    setBlockedBrands,
    allBrandNames,
    availableModels,
    allowedModels,
    setAllowedModels,
  } = data;
  const [savingRouting, setSavingRouting] = useState(false);
  const [showAdvancedRouting, setShowAdvancedRouting] = useState(false);
  const [savingBrandFilter, setSavingBrandFilter] = useState(false);
  const [allowedModelsInput, setAllowedModelsInput] = useState('');
  const [savingAllowedModels, setSavingAllowedModels] = useState(false);
  const toast = useToast();

  const { inputStyle } = styles;

  const activeRoutingProfile = useMemo(
    () => resolveRoutingProfilePreset(runtime.routingWeights),
    [runtime.routingWeights],
  );

  const saveRouting = async () => {
    setSavingRouting(true);
    try {
      await api.updateRuntimeSettings({
        routingWeights: runtime.routingWeights,
        embeddingCacheEnabled: runtime.embeddingCacheEnabled,
        embeddingCacheTtlSec: Number.isFinite(runtime.embeddingCacheTtlSec) && runtime.embeddingCacheTtlSec >= 1
          ? Math.trunc(runtime.embeddingCacheTtlSec)
          : 21600,
        embeddingCacheMaxEntries: Number.isFinite(runtime.embeddingCacheMaxEntries) && runtime.embeddingCacheMaxEntries >= 1
          ? Math.trunc(runtime.embeddingCacheMaxEntries)
          : 1000,
        routingFallbackUnitCost: runtime.routingFallbackUnitCost,
        proxyFirstByteTimeoutSec: Number.isFinite(runtime.proxyFirstByteTimeoutSec)
          ? Math.max(0, Math.trunc(runtime.proxyFirstByteTimeoutSec))
          : 0,
        accountVerifyTimeoutMs: Number.isFinite(runtime.accountVerifyTimeoutMs)
          ? Math.max(3000, Math.trunc(runtime.accountVerifyTimeoutMs))
          : 10000,
        proxyTestTimeoutMs: Number.isFinite(runtime.proxyTestTimeoutMs)
          ? Math.max(3000, Math.trunc(runtime.proxyTestTimeoutMs))
          : 30000,
        modelProtocolBadgeWindowDays: Number.isFinite(runtime.modelProtocolBadgeWindowDays)
          ? Math.max(1, Math.trunc(runtime.modelProtocolBadgeWindowDays))
          : 3,
        accountAvailabilityWindowHours: Number.isFinite(runtime.accountAvailabilityWindowHours)
          ? Math.max(1, Math.trunc(runtime.accountAvailabilityWindowHours))
          : 24,
        tokenRouterFailureCooldownMaxSec: toRouteCooldownSeconds(
          runtime.routeFailureCooldownMaxValue,
          runtime.routeFailureCooldownMaxUnit,
        ),
        disableCrossProtocolFallback: runtime.disableCrossProtocolFallback,
      });
      toast.success('Routing weights saved');
    } catch (err: any) {
      toast.error(err?.message || '保存失败');
    } finally {
      setSavingRouting(false);
    }
  };

  const applyRoutingPreset = (preset: 'balanced' | 'stable' | 'cost') => {
    setRuntime((prev) => ({
      ...prev,
      routingWeights: applyRoutingProfilePreset(preset),
    }));
  };

  const handleSaveBrandFilter = async () => {
    setSavingBrandFilter(true);
    try {
      const res = await api.updateRuntimeSettings({ globalBlockedBrands: blockedBrands });
      const resolved = Array.isArray(res?.globalBlockedBrands) ? res.globalBlockedBrands : blockedBrands;
      setRuntime((prev) => ({ ...prev, globalBlockedBrands: resolved }));
      setBlockedBrands(resolved);
      toast.success('品牌屏蔽设置已保存');
      try {
        await api.rebuildRoutes(false);
        toast.success('路由已重建');
      } catch {
        toast.error('品牌屏蔽已保存，但路由重建失败，请手动重建');
      }
    } catch (err: any) {
      toast.error(err?.message || '保存品牌屏蔽设置失败');
    } finally {
      setSavingBrandFilter(false);
    }
  };

  const handleSaveAllowedModels = async () => {
    setSavingAllowedModels(true);
    try {
      const res = await api.updateRuntimeSettings({ globalAllowedModels: allowedModels });
      const resolved = Array.isArray(res?.globalAllowedModels) ? res.globalAllowedModels : allowedModels;
      setRuntime((prev) => ({ ...prev, globalAllowedModels: resolved }));
      setAllowedModels(resolved);
      toast.success('模型白名单设置已保存');
      try {
        await api.rebuildRoutes(false);
        toast.success('路由已重建');
      } catch {
        toast.error('模型白名单已保存，但路由重建失败，请手动重建');
      }
    } catch (err: any) {
      toast.error(err?.message || '保存模型白名单设置失败');
    } finally {
      setSavingAllowedModels(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card animate-slide-up stagger-1" style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>路由策略</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            先选择预设策略，只有需要精调时再展开高级参数。
          </div>
          <div style={{ marginBottom: 12, maxWidth: 280 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                无实测/配置/目录价时默认单价
            </div>
            <input
              type="number"
              min={0.000001}
              step={0.000001}
              value={runtime.routingFallbackUnitCost}
              onChange={(e) => {
                const nextValue = Number(e.target.value);
                setRuntime((prev) => ({
                  ...prev,
                  routingFallbackUnitCost: Number.isFinite(nextValue) && nextValue > 0 ? nextValue : prev.routingFallbackUnitCost,
                }));
              }}
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 12, maxWidth: 420 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>
              普通失败冷却上限
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: 'wrap' }}>
              <input
                type="number"
                aria-label="路由失败冷却上限数值"
                min={1}
                step={1}
                value={runtime.routeFailureCooldownMaxValue}
                onChange={(e) => {
                  const nextValue = Number(e.target.value);
                  setRuntime((prev) => ({
                    ...prev,
                    routeFailureCooldownMaxValue: Number.isFinite(nextValue) && nextValue > 0
                      ? Math.max(1, Math.trunc(nextValue))
                      : prev.routeFailureCooldownMaxValue,
                  }));
                }}
                style={{ ...inputStyle, flex: '1 1 180px', marginBottom: 0 }}
              />
              <div style={{ width: 132, minWidth: 132 }}>
                <ModernSelect
                  size="sm"
                  value={runtime.routeFailureCooldownMaxUnit}
                  onChange={(nextValue) => {
                    setRuntime((prev) => ({
                      ...prev,
                      routeFailureCooldownMaxUnit: nextValue as RouteCooldownUnit,
                    }));
                  }}
                  options={ROUTE_COOLDOWN_UNIT_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  placeholder="选择单位"
                />
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6, lineHeight: 1.6 }}>
              支持秒、分钟、小时、天。只封顶普通失败与轮询分级冷却；429 限额类冷却仍优先遵循上游 reset 提示，避免过早重试。
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button
              onClick={() => applyRoutingPreset('balanced')}
              className="btn btn-ghost"
              style={{
                border: activeRoutingProfile === 'balanced' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                color: activeRoutingProfile === 'balanced' ? 'var(--color-primary)' : undefined,
              }}
            >
              均衡
            </button>
            <button
              onClick={() => applyRoutingPreset('stable')}
              className="btn btn-ghost"
              style={{
                border: activeRoutingProfile === 'stable' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                color: activeRoutingProfile === 'stable' ? 'var(--color-primary)' : undefined,
              }}
            >
              稳定优先
            </button>
            <button
              onClick={() => applyRoutingPreset('cost')}
              className="btn btn-ghost"
              style={{
                border: activeRoutingProfile === 'cost' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                color: activeRoutingProfile === 'cost' ? 'var(--color-primary)' : undefined,
              }}
            >
              成本优先
            </button>
            <button
              onClick={() => setShowAdvancedRouting((prev) => !prev)}
              className="btn btn-ghost"
              style={{ border: '1px solid var(--color-border)' }}
            >
              {showAdvancedRouting ? '收起高级参数' : '展开高级参数'}
            </button>
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={runtime.disableCrossProtocolFallback}
              onChange={(e) => setRuntime((prev) => ({
                ...prev,
                disableCrossProtocolFallback: e.target.checked,
              }))}
              style={{ marginTop: 2 }}
            />
            <span>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                失败时不尝试其他协议
              </span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.7 }}>
                仅影响 chat / messages / responses 之间的协议切换；不会关闭同协议兼容重试、OAuth 刷新或通道级重试。
              </span>
            </span>
          </label>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>
              首字超时（无首包 / 首 token）
            </div>
            <input
              type="number"
              min={0}
              step={1}
              aria-label="首字超时秒数"
              value={runtime.proxyFirstByteTimeoutSec}
              onChange={(e) => {
                const nextValue = Number(e.target.value);
                setRuntime((prev) => ({
                  ...prev,
                  proxyFirstByteTimeoutSec: Number.isFinite(nextValue) && nextValue >= 0
                    ? Math.trunc(nextValue)
                    : prev.proxyFirstByteTimeoutSec,
                }));
              }}
              style={inputStyle}
            />
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.7, marginTop: 6 }}>
              `0` 表示关闭。只有在指定时间内完全没有任何首包返回时才会切换通道，已经开始输出的请求不会被中断。
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Embeddings 响应缓存</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={runtime.embeddingCacheEnabled}
                onChange={(e) => setRuntime((prev) => ({ ...prev, embeddingCacheEnabled: e.target.checked }))}
              />
              <span style={{ fontSize: 13 }}>启用 Embeddings 响应缓存（相同输入直接返回缓存结果，不重复扣费）</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>缓存有效期（秒）</div>
                <input
                  type="number"
                  min={1}
                  step={60}
                  aria-label="Embeddings 缓存有效期（秒）"
                  value={runtime.embeddingCacheTtlSec}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setRuntime((prev) => ({
                      ...prev,
                      embeddingCacheTtlSec: Number.isFinite(next) && next >= 1 ? Math.trunc(next) : prev.embeddingCacheTtlSec,
                    }));
                  }}
                  style={inputStyle}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>最大缓存条目数</div>
                <input
                  type="number"
                  min={1}
                  step={100}
                  aria-label="最大缓存条目数"
                  value={runtime.embeddingCacheMaxEntries}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setRuntime((prev) => ({
                      ...prev,
                      embeddingCacheMaxEntries: Number.isFinite(next) && next >= 1 ? Math.trunc(next) : prev.embeddingCacheMaxEntries,
                    }));
                  }}
                  style={{ ...inputStyle }}
                />
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
                  Embeddings 输出具有确定性，缓存不会改变结果。修改后需点击下方保存按钮才能生效。
                </div>
              </div>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>探测与统计窗口</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>账号验活超时（毫秒）</div>
                <input
                  type="number"
                  min={3000}
                  step={500}
                  aria-label="账号验活超时毫秒"
                  value={runtime.accountVerifyTimeoutMs}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setRuntime((prev) => ({
                      ...prev,
                      accountVerifyTimeoutMs: Number.isFinite(next) && next >= 3000 ? Math.trunc(next) : prev.accountVerifyTimeoutMs,
                    }));
                  }}
                  style={inputStyle}
                />
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
                  账号验活与刷新时的单次请求超时，最小 3000ms。
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>测活请求超时（毫秒）</div>
                <input
                  type="number"
                  min={3000}
                  step={1000}
                  aria-label="测活请求超时毫秒"
                  value={runtime.proxyTestTimeoutMs}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setRuntime((prev) => ({
                      ...prev,
                      proxyTestTimeoutMs: Number.isFinite(next) && next >= 3000 ? Math.trunc(next) : prev.proxyTestTimeoutMs,
                    }));
                  }}
                  style={inputStyle}
                />
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
                  模型试玩与测试请求的超时，最小 3000ms。
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>协议徽章回看窗口（天）</div>
                <input
                  type="number"
                  min={1}
                  step={1}
                  aria-label="协议徽章回看窗口天数"
                  value={runtime.modelProtocolBadgeWindowDays}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setRuntime((prev) => ({
                      ...prev,
                      modelProtocolBadgeWindowDays: Number.isFinite(next) && next >= 1 ? Math.trunc(next) : prev.modelProtocolBadgeWindowDays,
                    }));
                  }}
                  style={inputStyle}
                />
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
                  模型协议徽章基于最近 N 天的真实代理日志判定。
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>账号可用性统计窗口（小时）</div>
                <input
                  type="number"
                  min={1}
                  step={1}
                  aria-label="账号可用性统计窗口小时"
                  value={runtime.accountAvailabilityWindowHours}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setRuntime((prev) => ({
                      ...prev,
                      accountAvailabilityWindowHours: Number.isFinite(next) && next >= 1 ? Math.trunc(next) : prev.accountAvailabilityWindowHours,
                    }));
                  }}
                  style={inputStyle}
                />
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
                  账号可用性基于最近 N 小时的代理日志投影。
                </div>
              </div>
            </div>
          </div>
          <div className={`anim-collapse ${showAdvancedRouting ? 'is-open' : ''}`.trim()}>
            <div className="anim-collapse-inner" style={{ paddingTop: 2 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              {([
                ['baseWeightFactor', '基础权重因子'],
                ['valueScoreFactor', '价值分因子'],
                ['costWeight', '成本权重'],
                ['balanceWeight', '余额权重'],
                ['usageWeight', '使用频次权重'],
              ] as Array<[keyof RoutingWeights, string]>).map(([key, label]) => (
                <div key={key}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>{label}</div>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={runtime.routingWeights[key]}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setRuntime((prev) => ({
                        ...prev,
                        routingWeights: {
                          ...prev.routingWeights,
                          [key]: Number.isFinite(v) ? v : 0,
                        },
                      }));
                    }}
                    style={inputStyle}
                  />
                </div>
              ))}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <button onClick={saveRouting} disabled={savingRouting} className="btn btn-primary">
              {savingRouting ? <><span className="spinner spinner-sm" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }} /> 保存中...</> : '保存路由策略'}
            </button>
          </div>
        </div>

        {/* Global Brand Filter */}
        <div className="card animate-slide-up stagger-2" style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>全局品牌屏蔽</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
            屏蔽选定品牌后，路由重建时将自动跳过匹配该品牌的所有模型。点击品牌切换屏蔽状态，保存后自动触发路由重建。
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {(allBrandNames || []).map((brand) => {
              const isBlocked = blockedBrands.includes(brand);
              return (
                <button
                  key={brand}
                  type="button"
                  role="switch"
                  aria-checked={isBlocked}
                  onClick={() => {
                    if (isBlocked) {
                      setBlockedBrands((prev) => prev.filter((b) => b !== brand));
                    } else {
                      setBlockedBrands((prev) => [...prev, brand]);
                    }
                  }}
                  className={`badge ${isBlocked ? 'badge-warning' : 'badge-muted'}`}
                  style={{
                    fontSize: 12, cursor: 'pointer', border: 'none', padding: '5px 12px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {brand}
                </button>
              );
            })}
            {allBrandNames === null && (
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>加载品牌列表中...</span>
            )}
            {allBrandNames !== null && allBrandNames.length === 0 && (
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>暂无可用品牌</span>
            )}
          </div>
          {blockedBrands.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--color-warning)', marginBottom: 10 }}>
              已屏蔽 {blockedBrands.length} 个品牌：{blockedBrands.join('、')}
            </div>
          )}
          <button onClick={handleSaveBrandFilter} disabled={savingBrandFilter} className="btn btn-primary" style={{ fontSize: 12, padding: '6px 16px' }}>
            {savingBrandFilter ? <><span className="spinner spinner-sm" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }} /> 保存中...</> : '保存品牌屏蔽'}
          </button>
        </div>

        {/* Global Allowed Models Whitelist */}
        <div className="card animate-slide-up stagger-2" style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>全局模型白名单</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
            配置白名单后，路由重建和候选生成将只针对白名单中的模型。留空表示允许所有模型（向后兼容）。保存后自动触发路由重建。
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                type="text"
                placeholder="输入模型名称，如：gpt-4"
                value={allowedModelsInput}
                onChange={(e) => setAllowedModelsInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && allowedModelsInput.trim()) {
                    const model = allowedModelsInput.trim();
                    if (!allowedModels.includes(model)) {
                      setAllowedModels((prev) => [...prev, model]);
                    }
                    setAllowedModelsInput('');
                  }
                }}
                style={{ flex: 1, ...inputStyle }}
              />
              <button
                onClick={() => {
                  if (allowedModelsInput.trim()) {
                    const model = allowedModelsInput.trim();
                    if (!allowedModels.includes(model)) {
                      setAllowedModels((prev) => [...prev, model]);
                    }
                    setAllowedModelsInput('');
                  }
                }}
                className="btn btn-ghost"
                style={{ border: '1px solid var(--color-border)', fontSize: 12, padding: '6px 12px' }}
              >
                添加
              </button>
            </div>
            {availableModels && availableModels.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                  或从当前可用模型中选择：
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 120, overflowY: 'auto', border: '1px solid var(--color-border)', padding: 8, borderRadius: 4 }}>
                  {availableModels.map((model) => {
                    const isAllowed = allowedModels.includes(model);
                    return (
                      <button
                        key={model}
                        type="button"
                        onClick={() => {
                          if (isAllowed) {
                            setAllowedModels((prev) => prev.filter((m) => m !== model));
                          } else {
                            setAllowedModels((prev) => [...prev, model]);
                          }
                        }}
                        className={`badge ${isAllowed ? 'badge-success' : 'badge-muted'}`}
                        style={{
                          fontSize: 11, cursor: 'pointer', border: 'none', padding: '4px 10px',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {model}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {allowedModels.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                  已选择 {allowedModels.length} 个模型：
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {allowedModels.map((model) => (
                    <div
                      key={model}
                      className="badge badge-success"
                      style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      {model}
                      <button
                        onClick={() => setAllowedModels((prev) => prev.filter((m) => m !== model))}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'inherit',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: 14,
                          lineHeight: 1,
                        }}
                        title="移除"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={handleSaveAllowedModels} disabled={savingAllowedModels} className="btn btn-primary" style={{ fontSize: 12, padding: '6px 16px' }}>
            {savingAllowedModels ? <><span className="spinner spinner-sm" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }} /> 保存中...</> : '保存模型白名单'}
          </button>
        </div>
      </div>
    </div>
  );
}