import React from 'react';
import type { UsageOverviewResponse } from '../../api.js';
import { VChart } from '@visactor/react-vchart';
import { useThemeLabelColor } from '../../components/useThemeLabelColor.js';
import UsageTrendChart from '../../components/charts/UsageTrendChart.js';
import {
  SummaryCard,
  EmptyState,
  formatCurrency,
  formatTokens,
  toSafeNumber,
  formatPercent,
  exportCsv,
} from './shared.js';

export default function OverviewTab({
  data,
  loading,
  isMobile,
}: {
  data: UsageOverviewResponse | null;
  loading: boolean;
  isMobile: boolean;
}) {
  const labelColor = useThemeLabelColor();
  const trend = data?.trend || [];
  const totals = data?.totals;

  if (!loading && (!trend.length || !totals)) {
    return <EmptyState title="暂无使用数据" desc="所选时间范围内没有可用的使用记录" />;
  }

  const totalTokens = toSafeNumber(totals?.tokens);
  const totalSpend = toSafeNumber(totals?.spend);
  const totalCalls = toSafeNumber(totals?.calls);
  const successRate = totalCalls > 0 ? (toSafeNumber(totals?.successCalls) / totalCalls) * 100 : 0;

  const promptTokens = toSafeNumber(totals?.promptTokens);
  const completionTokens = toSafeNumber(totals?.completionTokens);
  const tokenTotal = promptTokens + completionTokens;

  const compositionData = trend
    .filter((p) => p.promptTokens > 0 || p.completionTokens > 0)
    .map((p) => ({
      day: p.day,
      prompt: toSafeNumber(p.promptTokens),
      completion: toSafeNumber(p.completionTokens),
    }));

  const compositionSpec: Record<string, unknown> = {
    type: 'area' as const,
    data: [
      {
        id: 'prompt',
        values: compositionData.map((d) => ({ day: d.day, type: 'Prompt', value: d.prompt })),
      },
      {
        id: 'completion',
        values: compositionData.map((d) => ({ day: d.day, type: 'Completion', value: d.completion })),
      },
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
    tooltip: { dimension: { content: [{ key: (d: Record<string, unknown>) => String(d?.type || ''), value: (d: Record<string, unknown>) => Number(d?.value ?? 0).toLocaleString() }] } },
    animation: true,
    padding: { left: 8, right: 16, top: 8, bottom: 8 },
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <SummaryCard label="总 Tokens" value={formatTokens(totalTokens)} variant="green" />
        <SummaryCard label="总消耗" value={formatCurrency(totalSpend)} variant="purple" />
        <SummaryCard label="总调用" value={Math.round(totalCalls).toLocaleString()} variant="blue" />
        <SummaryCard label="成功率" value={formatPercent(successRate)} variant="orange" />
      </div>

      <UsageTrendChart data={trend} loading={loading} height={280} />

      {compositionData.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--color-text-secondary)' }}>
            Token 构成趋势
            <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 8 }}>
              Prompt {tokenTotal > 0 ? ((promptTokens / tokenTotal) * 100).toFixed(1) : 0}% / Completion {tokenTotal > 0 ? ((completionTokens / tokenTotal) * 100).toFixed(1) : 0}%
            </span>
          </div>
          <div style={{ height: 240, background: 'var(--color-bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-light)', padding: 16 }}>
            <VChart spec={compositionSpec as any} style={{ width: '100%', height: '100%' }} />
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn btn-ghost"
          style={{ fontSize: 12, border: '1px solid var(--color-border)' }}
          onClick={() =>
            exportCsv(
              'usage-overview.csv',
              ['日期', 'Tokens', '消耗', '调用', '成功调用', '成功率', 'Prompt Tokens', 'Completion Tokens'],
              trend.map((p) => [
                p.day,
                p.tokens,
                p.spend.toFixed(6),
                p.calls,
                p.successCalls,
                p.calls > 0 ? ((p.successCalls / p.calls) * 100).toFixed(1) + '%' : '0%',
                p.promptTokens,
                p.completionTokens,
              ]),
            )
          }
        >
          导出 CSV
        </button>
      </div>
    </div>
  );
}
