import React, { useMemo } from 'react';
import { VChart } from '@visactor/react-vchart';
import { useThemeLabelColor } from '../../components/useThemeLabelColor.js';
import type { UsageByKeyResponse } from '../../api.js';
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

export default function KeyTab({
  data,
  loading,
  isMobile,
}: {
  data: UsageByKeyResponse | null;
  loading: boolean;
  isMobile: boolean;
}) {
  const labelColor = useThemeLabelColor();
  const items = data?.items || [];
  const top10 = useMemo(() => items.slice(0, 10), [items]);
  const tableRows = useMemo(() => items.slice(0, 50), [items]);

  const barSpec = useMemo(() => ({
    type: 'bar' as const,
    data: [{
      id: 'data',
      values: top10
        .map((d) => ({
          name: (d.keyName || '').length > 20 ? (d.keyName || '').slice(0, 20) + '...' : d.keyName || '未关联',
          value: toSafeNumber(d.tokens),
        }))
        .reverse(),
    }],
    xField: 'value',
    yField: 'name',
    direction: 'horizontal' as const,
    bar: {
      style: {
        cornerRadius: [0, 6, 6, 0],
        fill: { gradient: 'linear' as const, x0: 0, y0: 0, x1: 1, y1: 0, stops: [{ offset: 0, color: CHART_COLORS[1] }, { offset: 1, color: '#67e8f9' }] },
      },
    },
    label: { visible: true, position: 'right', formatter: '{value}', style: { fontSize: 11, fill: labelColor, stroke: 'transparent' } },
    axes: [
      { orient: 'left', label: { style: { fontSize: 11, fill: labelColor } } },
      { orient: 'bottom', visible: false },
    ],
    animation: true,
    background: 'transparent',
  }), [top10, labelColor]);

  if (loading) {
    return <div className="skeleton" style={{ width: '100%', height: 300, borderRadius: 'var(--radius-md)' }} />;
  }

  if (items.length === 0) {
    return <EmptyState title="暂无 API Key 使用数据" desc="所选时间范围内没有下游 Key 使用记录" />;
  }

  return (
    <div>
      <div style={{ height: 280, background: 'var(--color-bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-light)', padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--color-text-secondary)' }}>Token 消耗分布 (Top 10)</div>
        <VChart spec={barSpec as any} style={{ width: '100%', height: 'calc(100% - 28px)' }} />
      </div>

      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tableRows.map((item, index) => {
            const rate = successRateBadge(item.successRate);
            return (
              <MobileCard
                key={item.keyId ?? index}
                title={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 22, height: 22, borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: rankBadge(index) || 'var(--color-bg)',
                      color: index < 3 ? '#fff' : 'var(--color-text-muted)',
                    }}>{index + 1}</span>
                    {item.keyName}
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
                <th>API Key</th>
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
                  <tr key={item.keyId ?? index}>
                    <td style={{ textAlign: 'center', padding: '8px 4px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 22, height: 22, borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: badge || 'var(--color-bg)',
                        color: index < 3 ? '#fff' : 'var(--color-text-muted)',
                      }}>{index + 1}</span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{item.keyName}</td>
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
              'usage-by-key.csv',
              ['API Key', 'Tokens', '消耗', '调用', '成功调用', '成功率'],
              items.map((d) => [d.keyName, d.tokens, d.spend.toFixed(6), d.calls, d.successCalls, `${d.successRate}%`]),
            )
          }
        >
          导出 CSV
        </button>
      </div>
    </div>
  );
}
