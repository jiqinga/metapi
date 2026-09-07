import React, { useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.js';
import { useIsMobile } from '../../components/useIsMobile.js';
import ChangeKeyModal from '../../components/ChangeKeyModal.js';
import { clearAuthSession } from '../../authSession.js';
import { generateDownstreamSkKey } from '../helpers/generateDownstreamSkKey.js';
import type { SettingsData } from './settingsData.js';
import { getSettingsStyles } from './settingsStyles.js';

const PROXY_TOKEN_PREFIX = 'sk-';

export default function SecuritySection({ data }: { data: SettingsData }) {
  const isMobile = useIsMobile();
  const styles = getSettingsStyles(isMobile);
  const {
    runtime,
    setRuntime,
    maskedToken,
    setMaskedToken,
    adminIpAllowlistText,
    setAdminIpAllowlistText,
  } = data;
  const [proxyTokenSuffix, setProxyTokenSuffix] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [showChangeKey, setShowChangeKey] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const toast = useToast();

  const normalizeProxyTokenSuffix = (raw: string) => {
    const compact = raw.replace(/\s+/g, '');
    if (compact.toLowerCase().startsWith(PROXY_TOKEN_PREFIX)) {
      return compact.slice(PROXY_TOKEN_PREFIX.length);
    }
    return compact;
  };

  const saveProxyToken = async () => {
    const suffix = proxyTokenSuffix.trim();
    if (!suffix) {
      toast.info('请输入 sk- 后的令牌内容');
      return;
    }
    setSavingToken(true);
    try {
      const res = await api.updateRuntimeSettings({ proxyToken: `${PROXY_TOKEN_PREFIX}${suffix}` });
      setRuntime((prev) => ({ ...prev, proxyTokenMasked: res.proxyTokenMasked || prev.proxyTokenMasked }));
      setProxyTokenSuffix('');
      toast.success('Proxy token updated');
    } catch (err: any) {
      toast.error(err?.message || '保存失败');
    } finally {
      setSavingToken(false);
    }
  };

  const saveSecuritySettings = async () => {
    setSavingSecurity(true);
    try {
      const allowlist = adminIpAllowlistText
        .split(/\r?\n|,/g)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      const res = await api.updateRuntimeSettings({
        adminIpAllowlist: allowlist,
      });
      setRuntime((prev) => ({
        ...prev,
        adminIpAllowlist: allowlist,
        currentAdminIp: typeof res?.currentAdminIp === 'string'
          ? res.currentAdminIp
          : prev.currentAdminIp,
      }));
      toast.success('Security settings saved');
    } catch (err: any) {
      toast.error(err?.message || '保存失败');
    } finally {
      setSavingSecurity(false);
    }
  };

  const { inputStyle } = styles;

  return (
    <div className="animate-fade-in">
      <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card animate-slide-up stagger-1" style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>管理员登录令牌</div>
          <code style={{ display: 'block', padding: '10px 14px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-light)', marginBottom: 12 }}>
            {maskedToken || '****'}
          </code>
          <button onClick={() => setShowChangeKey(true)} className="btn btn-primary">修改登录令牌</button>
          <ChangeKeyModal
            open={showChangeKey}
            onClose={() => {
              setShowChangeKey(false);
              api.getAuthInfo().then((r: any) => setMaskedToken(r.masked || '****')).catch(() => { });
            }}
          />
        </div>

        <div className="card animate-slide-up stagger-2" style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>下游访问令牌（PROXY_TOKEN）</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            用于下游站点或客户端访问本服务代理接口。前缀 sk- 固定不可修改，只需填写后缀。
          </div>
          <code style={{ display: 'block', padding: '10px 14px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-light)', marginBottom: 10 }}>
            当前：{runtime.proxyTokenMasked || '未设置'}
          </code>
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'stretch',
              marginBottom: 10,
              minWidth: 0,
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                ...inputStyle,
                flex: 1,
                minWidth: 200,
                marginBottom: 0,
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                overflow: 'hidden',
              }}
            >
              <span
                style={{
                  padding: '10px 12px',
                  borderRight: '1px solid var(--color-border-light)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  color: 'var(--color-text-secondary)',
                  userSelect: 'none',
                  background: 'color-mix(in srgb, var(--color-text-muted) 6%, transparent)',
                }}
              >
                {PROXY_TOKEN_PREFIX}
              </span>
              <input
                type="text"
                value={proxyTokenSuffix}
                onChange={(e) => setProxyTokenSuffix(normalizeProxyTokenSuffix(e.target.value))}
                placeholder="请输入 sk- 后的令牌内容"
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  padding: '10px 12px',
                }}
              />
            </div>
            <button
              type="button"
              className="btn btn-soft-primary"
              aria-label="随机生成访问令牌后缀"
              title="生成高熵随机后缀（不会自动保存）"
              style={{
                flexShrink: 0,
                padding: '10px 18px',
                fontSize: 13,
                gap: 8,
                alignSelf: 'stretch',
              }}
              onClick={() => {
                const full = generateDownstreamSkKey(PROXY_TOKEN_PREFIX);
                setProxyTokenSuffix(full.slice(PROXY_TOKEN_PREFIX.length));
              }}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                />
              </svg>
              随机生成
            </button>
          </div>
          <button onClick={saveProxyToken} disabled={savingToken} className="btn btn-primary">
            {savingToken ? <><span className="spinner spinner-sm" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }} /> 保存中...</> : '更新下游访问令牌'}
          </button>
        </div>

        <div className="card animate-slide-up stagger-3" style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>会话与安全</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            登录会话默认 12 小时自动过期。可选配置管理端 IP 白名单，支持每行一个 IP 或 IPv4 CIDR 网段。
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>
            当前识别到的管理端 IP（由服务端判定）：
          </div>
          <code style={{ display: 'block', padding: '10px 14px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-light)', marginBottom: 10 }}>
            {runtime.currentAdminIp || '未知'}
          </code>
          <textarea
            value={adminIpAllowlistText}
            onChange={(e) => setAdminIpAllowlistText(e.target.value)}
            placeholder={'例如：\n127.0.0.1\n192.168.1.10\n192.168.1.0/24'}
            rows={4}
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)', resize: 'vertical', marginBottom: 10 }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={saveSecuritySettings} disabled={savingSecurity} className="btn btn-primary">
              {savingSecurity ? <><span className="spinner spinner-sm" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }} /> 保存中...</> : '保存安全设置'}
            </button>
            <button
              onClick={() => {
                clearAuthSession(localStorage);
                window.location.reload();
              }}
              className="btn btn-danger"
            >
              退出登录
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
