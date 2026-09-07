import React, { useMemo } from 'react';
import { VChart } from '@visactor/react-vchart';
import { useThemeLabelColor } from '../../components/useThemeLabelColor.js';
import type { UsageByClientResponse } from '../../api.js';
import { MobileCard, MobileField } from '../../components/MobileCard.js';
import {
  EmptyState,
  formatCurrency,
  formatTokens,
  successRateBadge,
  formatPercent,
  rankBadge,
  toSafeNumber,
  exportCsv,
  CHART_COLORS,
} from './shared.js';

export default function ClientTab({
  data,
  loading,
  isMobile,
}: {
  data: UsageByClientResponse | null;
  loading: boolean;
  isMobile: boolean;
}) {
  const labelColor = useThemeLabelColor();
  const items = data?.items || [];
  const top10 = useMemo(() => items.slice(0, 10), [items]);
  const tableRows = useMemo(() => items.slice(0, 50), [items]);

  const pieSpec = useMemo(() => ({
    type: 'pie' as const,
    data: [{ id: 'data', values: top10.map((d) => ({ name: d.clientName, value: toSafeNumber(d.tokens) })) }],
    valueField: 'value',
    categoryField: 'name',
    outerRadius: 0.8,
    innerRadius: 0.55,
    pie: { style: { cornerRadius: 4, padAngle: 0.02 } },
    label: { visible: true, position: 'outside', formatter: '{_percent_}%', style: { fill: labelColor } },
    legends: { visible: false },
    animation: true,
    color: CHART_COLORS,
    background: 'transparent',
  }), [top10, labelColor]);

  if (loading) {
    return <div className="skeleton" style={{ width: '100%', height: 300, borderRadius: 'var(--radius-md)' }} />;
  }

  if (items.length === 0) {
    return <EmptyState title="暂无客户端使用数据" desc="所选时间范围内没有客户端使用记录" />;
  }

  return (
    <div>
      <div style={{ height: 280, background: 'var(--color-bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-light)', padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--color-text-secondary)' }}>Token 分布 (Top 10)</div>
        <VChart spec={pieSpec as any} style={{ width: '100%', height: 'calc(100% - 28px)' }} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginBottom: 16, padding: '0 4px' }}>
        {top10.map((d, idx) => (
          <span key={d.clientName} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-secondary)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: CHART_COLORS[idx % CHART_COLORS.length], flexShrink: 0 }} />
            <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.clientName}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--color-text-primary)' }}>{formatTokens(d.tokens)}</span>
          </span>
        ))}
      </div>

      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tableRows.map((item, index) => {
            const rate = successRateBadge(item.successRate);
            return (
              <MobileCard
                key={item.clientName}
                title={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 22, height: 22, borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: rankBadge(index) || 'var(--color-bg)',
                      color: index < 3 ? '#fff' : 'var(--color-text-muted)',
                    }}>{index + 1}</span>
                    {item.clientName}
                  </span>
                }
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
                <th>客户端</th>
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
                  <tr key={item.clientName}>
                    <td style={{ textAlign: 'center', padding: '8px 4px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 22, height: 22, borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: badge || 'var(--color-bg)',
                        color: index < 3 ? '#fff' : 'var(--color-text-muted)',
                      }}>{index + 1}</span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{item.clientName}</td>
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
              'usage-by-client.csv',
              ['客户端', 'Tokens', '消耗', '调用', '成功调用', '成功率'],
              items.map((d) => [d.clientName, d.tokens, d.spend.toFixed(6), d.calls, d.successCalls, `${d.successRate}%`]),
            )
          }
        >
          导出 CSV
        </button>
      </div>
    </div>
  );
}
