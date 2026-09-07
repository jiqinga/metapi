import React, { useMemo } from 'react';
import type { UsageByAccountResponse } from '../../api.js';
import { MobileCard, MobileField } from '../../components/MobileCard.js';
import {
  EmptyState,
  formatCurrency,
  formatTokens,
  successRateBadge,
  formatPercent,
  rankBadge,
  exportCsv,
} from './shared.js';

export default function AccountTab({
  data,
  loading,
  isMobile,
}: {
  data: UsageByAccountResponse | null;
  loading: boolean;
  isMobile: boolean;
}) {
  const items = data?.items || [];
  const tableRows = useMemo(() => items.slice(0, 50), [items]);

  if (loading) {
    return <div className="skeleton" style={{ width: '100%', height: 300, borderRadius: 'var(--radius-md)' }} />;
  }

  if (items.length === 0) {
    return <EmptyState title="暂无账号使用数据" desc="所选时间范围内没有账号使用记录" />;
  }

  return (
    <div>
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tableRows.map((item, index) => {
            const rate = successRateBadge(item.successRate);
            return (
              <MobileCard
                key={item.accountId}
                title={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 22, height: 22, borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: rankBadge(index) || 'var(--color-bg)',
                      color: index < 3 ? '#fff' : 'var(--color-text-muted)',
                    }}>{index + 1}</span>
                    {item.accountName}
                  </span>
                }
                subtitle={item.siteName}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <MobileField label="Tokens" value={formatTokens(item.tokens)} />
                  <MobileField label="消耗" value={formatCurrency(item.spend)} />
                  <MobileField label="调用" value={item.calls.toLocaleString()} />
                  <MobileField label="成功率" value={<span style={{ color: rate.color, fontWeight: 600 }}>{formatPercent(item.successRate)}</span>} />
                </div>
              </MobileCard>
            );
          })}
        </div>
      ) : (
        <div style={{ overflow: 'hidden', border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-md)' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: 36, textAlign: 'center' }}>#</th>
                <th>账号</th>
                <th>所属站点</th>
                <th style={{ textAlign: 'right' }}>Tokens</th>
                <th style={{ textAlign: 'right' }}>消耗</th>
                <th style={{ textAlign: 'center' }}>调用</th>
                <th style={{ textAlign: 'center' }}>成功率</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((item, index) => {
                const rate = successRateBadge(item.successRate);
                const badge = rankBadge(index);
                return (
                  <tr key={item.accountId}>
                    <td style={{ textAlign: 'center', padding: '8px 4px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 22, height: 22, borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: badge || 'var(--color-bg)',
                        color: index < 3 ? '#fff' : 'var(--color-text-muted)',
                      }}>{index + 1}</span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{item.accountName}</td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{item.siteName}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatTokens(item.tokens)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(item.spend)}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{item.calls.toLocaleString()}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: rate.bg, color: rate.color }}>{formatPercent(item.successRate)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn btn-ghost"
          style={{ fontSize: 12, border: '1px solid var(--color-border)' }}
          onClick={() =>
            exportCsv(
              'usage-by-account.csv',
              ['账号', '所属站点', 'Tokens', '消耗', '调用', '成功调用', '成功率'],
              items.map((d) => [d.accountName, d.siteName, d.tokens, d.spend.toFixed(6), d.calls, d.successCalls, `${d.successRate}%`]),
            )
          }
        >
          导出 CSV
        </button>
      </div>
    </div>
  );
}
