import React, { useMemo, useState } from 'react';
import { VChart } from '@visactor/react-vchart';
import { useThemeLabelColor } from '../useThemeLabelColor.js';

type Metric = 'tokens' | 'spend' | 'calls' | 'successRate';

const METRIC_OPTIONS: Array<{ key: Metric; label: string }> = [
  { key: 'tokens', label: 'Tokens' },
  { key: 'spend', label: '消耗' },
  { key: 'calls', label: '请求数' },
  { key: 'successRate', label: '成功率' },
];

export type UsageTrendPoint = {
  day: string;
  tokens: number;
  spend: number;
  calls: number;
  successCalls: number;
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDayAxisLabel(raw: string): string {
  const trimmed = String(raw || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (match) return `${match[2]}/${match[3]}`;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return `${pad2(parsed.getMonth() + 1)}/${pad2(parsed.getDate())}`;
}

function formatMetricValue(metric: Metric, value: number): string {
  const n = Number(value || 0);
  if (metric === 'spend') {
    if (n >= 1000) return `$${n.toFixed(2)}`;
    if (n >= 1) return `$${n.toFixed(3)}`;
    return `$${n.toFixed(6)}`;
  }
  if (metric === 'successRate') return `${n.toFixed(1)}%`;
  return n.toLocaleString();
}

export default function UsageTrendChart({
  data,
  loading,
  height = 280,
}: {
  data: UsageTrendPoint[];
  loading?: boolean;
  height?: number;
}) {
  const [metric, setMetric] = useState<Metric>('tokens');
  const labelColor = useThemeLabelColor();

  const flatData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    return data.map((point) => {
      const value =
        metric === 'tokens'
          ? Number(point.tokens || 0)
          : metric === 'spend'
            ? Number(point.spend || 0)
            : metric === 'calls'
              ? Number(point.calls || 0)
              : point.calls > 0
                ? (Number(point.successCalls || 0) / point.calls) * 100
                : 0;
      return { day: point.day, value };
    });
  }, [data, metric]);

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          <div className="skeleton" style={{ width: 160, height: 30, borderRadius: 'var(--radius-sm)' }} />
        </div>
        <div className="skeleton" style={{ width: '100%', height, borderRadius: 'var(--radius-sm)' }} />
      </div>
    );
  }

  if (flatData.length === 0) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          <MetricToggle metric={metric} onChange={setMetric} />
        </div>
        <div className="empty-state" style={{ padding: 32 }}>
          <div className="empty-state-title">暂无趋势数据</div>
          <div className="empty-state-desc">所选时间范围内没有可用的使用记录</div>
        </div>
      </div>
    );
  }

  const spec: Record<string, unknown> = {
    type: 'area' as const,
    data: [{ id: 'data', values: flatData }],
    xField: 'day',
    yField: 'value',
    area: {
      style: {
        curveType: 'monotone',
        fillOpacity: 0.2,
      },
    },
    line: {
      style: {
        curveType: 'monotone',
        lineWidth: 2,
      },
    },
    point: { visible: false },
    axes: [
      {
        orient: 'bottom',
        label: {
          style: { fontSize: 11, fill: labelColor },
          formatMethod: (value: string) => formatDayAxisLabel(String(value || '')),
        },
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
    tooltip: {
      dimension: {
        title: { value: (datum: Record<string, unknown>) => formatDayAxisLabel(String(datum?.day || '')) },
        content: [
          {
            key: () => METRIC_OPTIONS.find((opt) => opt.key === metric)?.label || 'Value',
            value: (datum: Record<string, unknown>) => formatMetricValue(metric, Number(datum?.value ?? 0)),
          },
        ],
      },
    },
    color: ['var(--color-primary)'],
    background: 'transparent',
    animationAppear: {
      area: { type: 'fadeIn', duration: 500, easing: 'cubicOut' },
      line: { type: 'clipIn', duration: 700, easing: 'cubicOut' },
    },
    padding: { left: 8, right: 16, top: 8, bottom: 8 },
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <MetricToggle metric={metric} onChange={setMetric} />
      </div>
      <div style={{ width: '100%', height }}>
        <VChart spec={spec as any} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}

function MetricToggle({
  metric,
  onChange,
}: {
  metric: Metric;
  onChange: (m: Metric) => void;
}) {
  return (
    <div style={toggleGroupStyle}>
      {METRIC_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          style={{
            ...toggleBtnBase,
            ...(metric === opt.key ? toggleBtnActive : toggleBtnInactive),
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  background: 'var(--color-bg-card)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border-light)',
  boxShadow: 'var(--shadow-card)',
  padding: 16,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 10,
};

const toggleGroupStyle: React.CSSProperties = {
  display: 'inline-flex',
  gap: 0,
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)',
  overflow: 'hidden',
};

const toggleBtnBase: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
  transition: 'all 0.2s ease',
  fontFamily: 'inherit',
};

const toggleBtnActive: React.CSSProperties = {
  background: 'var(--color-primary)',
  color: '#ffffff',
};

const toggleBtnInactive: React.CSSProperties = {
  background: 'var(--color-bg-card)',
  color: 'var(--color-text-secondary)',
};
