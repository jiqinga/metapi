import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type UsageOverviewTrendPoint } from "../api.js";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DayCell {
  date: Date;
  dayKey: string; // YYYY-MM-DD
  calls: number;
  successCalls: number;
  tokens: number;
  level: 0 | 1 | 2 | 3 | 4;
}

type Metric = "calls" | "tokens";

const METRIC_OPTIONS: { key: Metric; label: string }[] = [
  { key: "calls", label: "请求量" },
  { key: "tokens", label: "Token 用量" },
];

/* ------------------------------------------------------------------ */
/*  Date helpers                                                        */
/* ------------------------------------------------------------------ */

function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDateTimeRouteValue(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function buildDayLogsRoute(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 0);
  return `/logs?from=${formatDateTimeRouteValue(start)}&to=${formatDateTimeRouteValue(end)}`;
}

/** Route to Usage Analytics filtered to a single day (YYYY-MM-DD). */
function buildDayUsageAnalyticsRoute(dayKey: string): string {
  return `/usage-analytics?from=${dayKey}&to=${dayKey}`;
}

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
const MONTH_LABELS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

/** Compact a large number: 12345 → "12.3K", 1234567 → "1.23M" */
function formatCompactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  return `${(n / 1_000_000_000).toFixed(2)}B`;
}

/* ------------------------------------------------------------------ */
/*  Level classification                                                */
/* ------------------------------------------------------------------ */

/**
 * Map a value to one of 5 intensity levels (0-4).
 * 0 = no activity; 1-4 use quartile thresholds derived from the max value.
 */
function classifyLevel(value: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0) return 0;
  if (max <= 0) return 1;
  const ratio = value / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

/**
 * CSS color for each intensity level — green ramp à la GitHub,
 * built from CSS variables so it adapts to theme.
 */
function levelColor(level: 0 | 1 | 2 | 3 | 4): string {
  switch (level) {
    case 0:
      return "var(--color-border-light)";
    case 1:
      return "#9be9a8";
    case 2:
      return "#40c463";
    case 3:
      return "#30a14e";
    case 4:
      return "#216e39";
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

interface ContributionHeatmapProps {
  /** Number of weeks to display. Default 26 (≈ half year). */
  weeks?: number;
}

export default function ContributionHeatmap({ weeks = 26 }: ContributionHeatmapProps) {
  const [trend, setTrend] = useState<UsageOverviewTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("calls");

  /* ---------- compute date range (ending today, local time) ---------- */

  const { startDate, endDate } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Align to Monday of the current week — the last column must contain today.
    // getDay(): 0=Sun, 1=Mon, ..., 6=Sat. Convert to "days since Monday".
    const daysSinceMonday = (today.getDay() + 6) % 7;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() - daysSinceMonday);
    // Walk back (weeks - 1) columns so the final column is the current week.
    const start = new Date(thisMonday);
    start.setDate(thisMonday.getDate() - (weeks - 1) * 7);
    return { startDate: start, endDate: today };
  }, [weeks]);

  /* ---------- fetch data ---------- */

  useEffect(() => {
    let cancelled = false;
    const fromKey = toDayKey(startDate);
    const toKey = toDayKey(endDate);
    setLoading(true);
    api
      .getUsageOverview({ from: fromKey, to: toKey })
      .then((res) => {
        if (!cancelled) {
          setTrend(res.trend || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load contribution heatmap:", err);
          setError(err?.message || "加载失败");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate]);

  /* ---------- build lookup map ---------- */

  const dataMap = useMemo(() => {
    const map = new Map<string, UsageOverviewTrendPoint>();
    for (const point of trend) {
      map.set(point.day, point);
    }
    return map;
  }, [trend]);

  /* ---------- build grid (columns = weeks, rows = 7 days Mon-Sun) ---------- */

  const { columns, maxValue, monthLabels } = useMemo(() => {
    const cols: DayCell[][] = [];
    let max = 0;
    const labels: { col: number; month: number }[] = [];
    let lastMonth = -1;

    // Iterate week by week — exactly `weeks` columns, starting from Monday-aligned start
    const cursor = new Date(startDate);
    for (let w = 0; w < weeks; w++) {
      const week: DayCell[] = [];
      for (let i = 0; i < 7; i++) {
        const dayDate = new Date(cursor);
        const dayKey = toDayKey(dayDate);
        const point = dataMap.get(dayKey);
        const calls = point?.calls ?? 0;
        const successCalls = point?.successCalls ?? 0;
        const tokens = point?.tokens ?? 0;
        const metricValue = metric === "calls" ? calls : tokens;
        if (metricValue > max) max = metricValue;
        week.push({ date: dayDate, dayKey, calls, successCalls, tokens, level: 0 });

        // Track month label — detected on first day of each week column
        if (i === 0) {
          const month = dayDate.getMonth(); // 0-11
          if (month !== lastMonth) {
            labels.push({ col: w, month });
            lastMonth = month;
          }
        }

        cursor.setDate(cursor.getDate() + 1);
      }
      cols.push(week);
    }

    // Assign levels based on the selected metric
    for (const week of cols) {
      for (const cell of week) {
        const v = metric === "calls" ? cell.calls : cell.tokens;
        cell.level = classifyLevel(v, max);
      }
    }

    return { columns: cols, maxValue: max, monthLabels: labels };
  }, [startDate, endDate, dataMap, weeks, metric]);

  /* ---------- totals ---------- */

  const totals = useMemo(() => {
    let totalCalls = 0;
    let totalSuccess = 0;
    let totalTokens = 0;
    let activeDays = 0;
    for (const week of columns) {
      for (const cell of week) {
        totalCalls += cell.calls;
        totalSuccess += cell.successCalls;
        totalTokens += cell.tokens;
        if (cell.calls > 0) activeDays++;
      }
    }
    return { totalCalls, totalSuccess, totalTokens, activeDays };
  }, [columns]);

  /* ---------- loading state ---------- */

  if (loading) {
    return (
      <div className="chart-container animate-slide-up stagger-6">
        <div style={{ marginBottom: 16 }}>
          <div className="skeleton" style={{ width: 180, height: 18, marginBottom: 10 }} />
          <div className="skeleton" style={{ width: "100%", height: 140, borderRadius: 8 }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="chart-container animate-slide-up stagger-6">
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          请求活跃度
        </div>
        <div className="empty-state" style={{ padding: 32 }}>
          <div className="empty-state-title">加载失败</div>
          <div className="empty-state-desc">{error}</div>
        </div>
      </div>
    );
  }

  /* ---------- render ---------- */

  const cellSize = 13;
  const cellGap = 3;
  const labelOffset = 28; // left gutter for weekday labels
  const monthLabelHeight = 18;

  return (
    <div className="chart-container animate-slide-up stagger-6 contribution-heatmap-panel">
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--color-text-primary)",
            }}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            请求活跃度
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
            近 {weeks} 周 · 共{" "}
            {metric === "calls"
              ? `${totals.totalCalls.toLocaleString()} 次请求`
              : `${formatCompactNumber(totals.totalTokens)} Tokens`}
            {" · "}活跃 {totals.activeDays} 天
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div
            style={{
              display: "inline-flex",
              gap: 0,
              borderRadius: 6,
              border: "1px solid var(--color-border)",
              overflow: "hidden",
            }}
          >
            {METRIC_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setMetric(opt.key)}
                style={{
                  padding: "3px 12px",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  border: "none",
                  fontFamily: "inherit",
                  transition: "all 0.2s ease",
                  background:
                    metric === opt.key ? "var(--color-primary)" : "var(--color-bg-card)",
                  color: metric === opt.key ? "#fff" : "var(--color-text-secondary)",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Legend */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--color-text-muted)" }}>
            <span>少</span>
            {([0, 1, 2, 3, 4] as const).map((lvl) => (
              <span
                key={lvl}
                style={{
                  display: "inline-block",
                  width: cellSize,
                  height: cellSize,
                  borderRadius: 2,
                  background: levelColor(lvl),
                }}
              />
            ))}
            <span>多</span>
          </div>
        </div>
      </div>

      {/* Scrollable heatmap on small screens */}
      <div
        style={{
          overflowX: "auto",
          paddingBottom: 4,
        }}
      >
        <div
          style={{
            position: "relative",
            width: labelOffset + columns.length * (cellSize + cellGap),
          }}
        >
          {/* Month labels */}
          <div
            style={{
              position: "relative",
              height: monthLabelHeight,
              marginLeft: labelOffset,
              marginBottom: 4,
            }}
          >
            {monthLabels.map(({ col, month }, idx) => {
              // Avoid overlapping: only show if enough distance from previous
              const prevCol = idx > 0 ? monthLabels[idx - 1].col : -1;
              if (col - prevCol < 2 && idx > 0) return null;
              return (
                <span
                  key={`${col}-${month}`}
                  style={{
                    position: "absolute",
                    left: col * (cellSize + cellGap),
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {MONTH_LABELS[month]}
                </span>
              );
            })}
          </div>

          {/* Grid */}
          <div style={{ display: "flex", marginLeft: labelOffset, position: "relative" }}>
            {/* Weekday labels (Mon/Wed/Fri) */}
            <div
              style={{
                position: "absolute",
                left: -labelOffset,
                top: 0,
                width: labelOffset,
                pointerEvents: "none",
              }}
            >
              {WEEKDAY_LABELS.map((label, idx) => {
                // Show Mon(0), Wed(2), Fri(4) only — like GitHub
                if (idx !== 0 && idx !== 2 && idx !== 4) return null;
                return (
                  <div
                    key={label}
                    style={{
                      position: "absolute",
                      top: idx * (cellSize + cellGap),
                      fontSize: 10,
                      color: "var(--color-text-muted)",
                      lineHeight: `${cellSize}px`,
                    }}
                  >
                    {label}
                  </div>
                );
              })}
            </div>

            {/* Week columns */}
            {columns.map((week, colIdx) => (
              <div
                key={colIdx}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: cellGap,
                  marginRight: cellGap,
                }}
              >
                {week.map((cell, rowIdx) => {
                  const isFuture = cell.date > endDate;
                  const isToday = cell.dayKey === toDayKey(endDate);
                  const failed = cell.calls - cell.successCalls;
                  const successRate =
                    cell.calls > 0
                      ? Math.round((cell.successCalls / cell.calls) * 100)
                      : 0;

                  const isActive = cell.calls > 0;
                  const primaryValue =
                    metric === "calls"
                      ? `${cell.calls} 次请求`
                      : `${formatCompactNumber(cell.tokens)} Tokens`;

                  const tooltipLines = [
                    primaryValue,
                    isActive
                      ? `请求 ${cell.calls} · 成功 ${cell.successCalls} · 失败 ${failed} · 成功率 ${successRate}%`
                      : "无请求",
                    isActive ? `Tokens ${formatCompactNumber(cell.tokens)}` : null,
                    cell.dayKey,
                  ].filter((line) => line !== null) as string[];

                  const cellTarget =
                    metric === "tokens"
                      ? buildDayUsageAnalyticsRoute(cell.dayKey)
                      : buildDayLogsRoute(cell.dayKey);

                  return (
                    <Link
                      key={`${colIdx}-${rowIdx}`}
                      to={cellTarget}
                      style={{
                        width: cellSize,
                        height: cellSize,
                        borderRadius: 2,
                        background: isFuture ? "transparent" : levelColor(cell.level),
                        display: "inline-block",
                        outline: isToday ? "1px solid var(--color-primary)" : "none",
                        outlineOffset: "1px",
                        opacity: isFuture ? 0 : 1,
                        cursor: isFuture || !isActive ? "default" : "pointer",
                        transition: "transform 0.1s ease",
                      }}
                      data-tooltip={tooltipLines.join(" · ")}
                      data-tooltip-align="start"
                      title={tooltipLines.join(" | ")}
                      aria-label={`${cell.dayKey} ${primaryValue}`}
                      onClick={(e) => {
                        if (!isActive) e.preventDefault();
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
