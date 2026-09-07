import React, { useMemo } from 'react';
import { VChart } from '@visactor/react-vchart';
import { useThemeLabelColor } from '../../components/useThemeLabelColor.js';
import type { TokenCompositionResponse } from '../../api.js';
import {
  EmptyState,
  SummaryCard,
  formatTokens,
  formatPercent,
  toSafeNumber,
  exportCsv,
} from './shared.js';

export default function TokenCompositionTab({
  data,
  loading,
  isMobile,
}: {
  data: TokenCompositionResponse | null;
  loading: boolean;
  isMobile: boolean;
}) {
  const labelColor = useThemeLabelColor();
  const trend = data?.trend || [];
  const totals = data?.totals;

  const chartData = useMemo(() => {
    const filtered = trend.filter((p) => p.promptTokens > 0 || p.completionTokens > 0);
    return {
      prompt: filtered.map((p) => ({ day: p.day, type: 'Prompt', value: toSafeNumber(p.promptTokens) })),
      completion: filtered.map((p) => ({ day: p.day, type: 'Completion', value: toSafeNumber(p.completionTokens) })),
    };
  }, [trend]);

  const spec: Record<string, unknown> = useMemo(() => ({
    type: 'area' as const,
    data: [
      { id: 'prompt', values: chartData.prompt },
      { id: 'completion', values: chartData.completion },
    ],
    xField: 'day',
    yField: 'value',
    seriesField: 'type',
    stack: true,
    area: { style: { fillOpacity: 0.5, curveType: 'monotone' } },
    line: { style: { lineWidth: 1.5, curveType: 'monotone' } },
    point: { visible: false },
    axes: [
      {
        orient: 'bottom',
        label: { style: { fontSize: 11, fill: labelColor } },
        domainLine: { style: { stroke: 'var(--color-border-light)' } },
        tick: { style: { stroke: 'var(--color-border-light)' } },
      },
      {
        orient: 'left',
        label: { style: { fontSize: 11, fill: labelColor } },
        grid: { style: { stroke: 'var(--color-border-light)', lineDash: [4, 4] } },
        domainLine: { visible: false },
      },
    ],
    legends: { visible: true, orient: 'bottom' },
    color: ['#4f46e5', '#06b6d4'],
    background: 'transparent',
    tooltip: {
      dimension: {
        content: [
          {
            key: (d: Record<string, unknown>) => String(d?.type || ''),
            value: (d: Record<string, unknown>) => Number(d?.value ?? 0).toLocaleString(),
          },
        ],
      },
    },
    animation: true,
    padding: { left: 8, right: 16, top: 8, bottom: 8 },
  }), [chartData, labelColor]);

  if (loading) {
    return <div className="skeleton" style={{ width: '100%', height: 300, borderRadius: 'var(--radius-md)' }} />;
  }

  if (chartData.prompt.length === 0 && chartData.completion.length === 0) {
    return <EmptyState title="暂无 Token 构成数据" desc="所选时间范围内没有 prompt/completion token 拆分记录" />;
  }

  const promptTokens = toSafeNumber(totals?.promptTokens);
  const completionTokens = toSafeNumber(totals?.completionTokens);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
        <SummaryCard label="Prompt Tokens" value={`${formatTokens(promptTokens)} (${formatPercent(totals?.promptRatio || 0)})`} variant="blue" />
        <SummaryCard label="Completion Tokens" value={`${formatTokens(completionTokens)} (${formatPercent(totals?.completionRatio || 0)})`} variant="green" />
      </div>

      <div style={{ height: 300, background: 'var(--color-bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-light)', padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--color-text-secondary)' }}>每日 Token 构成趋势</div>
        <div style={{ width: '100%', height: 'calc(100% - 28px)' }}>
          <VChart spec={spec as any} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn btn-ghost"
          style={{ fontSize: 12, border: '1px solid var(--color-border)' }}
          onClick={() =>
            exportCsv(
              'token-composition.csv',
              ['日期', 'Prompt Tokens', 'Completion Tokens', '总 Tokens'],
              trend.map((p) => [p.day, p.promptTokens, p.completionTokens, p.promptTokens + p.completionTokens]),
            )
          }
        >
          导出 CSV
        </button>
      </div>
    </div>
  );
}
