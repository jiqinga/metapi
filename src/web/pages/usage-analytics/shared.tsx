import React from 'react';
import { InlineBrandIcon } from '../../components/BrandIcon.js';
import { formatCompactTokenMetric } from '../../numberFormat.js';

export function toSafeNumber(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) return 0;
  return value;
}

export function formatCurrency(value: number): string {
  const n = toSafeNumber(value);
  if (n >= 1000) return `$${n.toFixed(2)}`;
  if (n >= 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(6)}`;
}

export function formatPercent(value: number): string {
  return `${toSafeNumber(value).toFixed(1)}%`;
}

export function formatTokens(value: number): string {
  return formatCompactTokenMetric(toSafeNumber(value));
}

export function formatLatency(ms: number | null | undefined): { text: string; color: string; bg: string } {
  if (ms == null || !Number.isFinite(ms)) {
    return { text: '—', color: 'var(--color-text-muted)', bg: 'transparent' };
  }
  const sec = ms / 1000;
  let color: string;
  let bg: string;
  if (sec <= 15) {
    const t = Math.min(sec / 15, 1);
    const r = Math.round(34 + t * (245 - 34));
    const g = Math.round(197 + t * (158 - 197));
    const b = Math.round(94 + t * (11 - 94));
    color = `rgb(${r},${g},${b})`;
    bg = `rgba(${r},${g},${b},0.08)`;
  } else if (sec <= 60) {
    const t = Math.min((sec - 15) / 45, 1);
    const r = Math.round(245 + t * (239 - 245));
    const g = Math.round(158 + t * (68 - 158));
    const b = Math.round(11 + t * (68 - 11));
    color = `rgb(${r},${g},${b})`;
    bg = `rgba(${r},${g},${b},0.08)`;
  } else {
    color = '#ef4444';
    bg = 'rgba(239,68,68,0.08)';
  }
  const text = ms >= 1000 ? `${(ms / 1000).toFixed(sec >= 60 ? 0 : 1)}s` : `${ms}ms`;
  return { text, color, bg };
}

export function successRateBadge(rate: number): { color: string; bg: string } {
  if (rate >= 90) return { color: '#16a34a', bg: 'rgba(34,197,94,0.1)' };
  if (rate >= 60) return { color: '#d97706', bg: 'rgba(245,158,11,0.1)' };
  return { color: '#dc2626', bg: 'rgba(239,68,68,0.1)' };
}

export function rankBadge(index: number): string | null {
  if (index < 3) {
    return ['linear-gradient(135deg,#fbbf24,#f59e0b)', 'linear-gradient(135deg,#94a3b8,#cbd5e1)', 'linear-gradient(135deg,#d97706,#fbbf24)'][index];
  }
  return null;
}

export function SummaryCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: 'purple' | 'blue' | 'green' | 'orange';
}) {
  return (
    <div className={`stat-summary-card stat-summary-${variant}`}>
      <div className="stat-summary-card-label">{label}</div>
      <div className="stat-summary-card-value">{value}</div>
    </div>
  );
}

export function EmptyState({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="empty-state" style={{ padding: 32 }}>
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-desc">{desc}</div>
    </div>
  );
}

export const CHART_COLORS = [
  '#4f46e5', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6',
];

export function ModelLabel({ model, maxLen = 25 }: { model: string; maxLen?: number }) {
  const display = model.length > maxLen ? model.slice(0, maxLen) + '...' : model;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <InlineBrandIcon model={model} size={14} />
      <code style={{ fontSize: 12, fontWeight: 500 }}>{display}</code>
    </span>
  );
}

export function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (val: string | number) => {
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
