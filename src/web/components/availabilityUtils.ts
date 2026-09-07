export type AvailabilityBucket = {
  startUtc?: string | null;
  label: string;
  totalRequests: number;
  successCount: number;
  failedCount: number;
  availabilityPercent: number | null;
  averageLatencyMs: number | null;
};

export type AvailabilitySummary = {
  totalRequests: number;
  successCount: number;
  failedCount: number;
  availabilityPercent: number | null;
  averageLatencyMs: number | null;
  buckets: AvailabilityBucket[];
};

export function formatAvailabilityPercent(
  value: number | null | undefined,
): string {
  if (
    typeof value !== "number" ||
    Number.isNaN(value) ||
    !Number.isFinite(value)
  )
    return "—";
  return `${Math.round(value)}%`;
}

export function getAvailabilityColor(
  value: number | null | undefined,
): string {
  if (
    typeof value !== "number" ||
    Number.isNaN(value) ||
    !Number.isFinite(value)
  ) {
    return "var(--color-border-light)";
  }
  const clamped = Math.max(0, Math.min(100, value));
  const low = { r: 229, g: 80, b: 69 };
  const mid = { r: 217, g: 161, b: 37 };
  const high = { r: 82, g: 196, b: 26 };

  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

  let r: number;
  let g: number;
  let b: number;

  if (clamped <= 50) {
    const t = clamped / 50;
    r = lerp(low.r, mid.r, t);
    g = lerp(low.g, mid.g, t);
    b = lerp(low.b, mid.b, t);
  } else {
    const t = (clamped - 50) / 50;
    r = lerp(mid.r, high.r, t);
    g = lerp(mid.g, high.g, t);
    b = lerp(mid.b, high.b, t);
  }

  return `rgb(${r}, ${g}, ${b})`;
}

export function padDateTimeSegment(value: number): string {
  return String(value).padStart(2, "0");
}

export function parseAvailabilityBucketStart(
  startUtc?: string | null,
): Date | null {
  const text = (startUtc || "").trim();
  if (!text) return null;
  // Server returns UTC SQL datetime "YYYY-MM-DD HH:MM:SS" (no Z suffix).
  // Without the Z, JS parses it as local time — normalize to ISO UTC.
  const iso = text.includes("T") ? text : `${text.replace(" ", "T")}Z`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function parseAvailabilityBucketLabel(label: string): Date | null {
  const match = label.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "0"] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    0,
  );
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function formatAvailabilityBucketLabel(bucket: AvailabilityBucket): string {
  const parsed =
    parseAvailabilityBucketStart(bucket.startUtc) ||
    parseAvailabilityBucketLabel(bucket.label);
  if (!parsed) return bucket.label;
  return `${parsed.getFullYear()}-${padDateTimeSegment(parsed.getMonth() + 1)}-${padDateTimeSegment(parsed.getDate())} ${padDateTimeSegment(parsed.getHours())}:${padDateTimeSegment(parsed.getMinutes())}:${padDateTimeSegment(parsed.getSeconds())}`;
}

export function formatRelativeTime(
  value: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!value) return "";
  // Server returns UTC SQL datetime "YYYY-MM-DD HH:MM:SS" (no Z suffix).
  // Without the Z, JS parses it as local time — normalize to ISO UTC.
  const text = value.trim();
  const iso = text.includes("T") ? text : `${text.replace(" ", "T")}Z`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  const diffMs = now.getTime() - parsed.getTime();
  if (diffMs < 0) return "刚刚";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}
