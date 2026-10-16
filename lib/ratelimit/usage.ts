import { RATE_LIMITS } from "./config.ts";

export const USAGE_LIMIT_NAMES = [
  "planHour",
  "planDay",
  "planIp",
  "voiceMinute",
  "voiceDay",
  "ttsCharacters",
] as const;
export type UsageName = (typeof USAGE_LIMIT_NAMES)[number];
export type UsageBucket = {
  current: number;
  previous: number;
  windowStart: number;
  windowMs: number;
};
export type UsageMeter = {
  id: UsageName;
  limit: number;
  remaining: number | null;
  used: number | null;
  availableAt: number | null;
  fullAt: number | null;
};
export type UsageSnapshot = {
  checkedAt: number;
  available: boolean;
  meters: UsageMeter[];
};

export function windowMilliseconds(window: string) {
  const [amount, unit] = window.split(" ");
  const scale = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  if (!scale || !Number.isFinite(Number(amount)))
    throw new Error("Invalid usage window");
  return Number(amount) * scale;
}
// Matches the single-region Upstash slidingWindow implementation used by the
// enforcement clients. Its SDK `reset` is only a bucket boundary, not a refill.
export function weightedUsage(bucket: UsageBucket, at: number) {
  const elapsed = Math.max(0, at - bucket.windowStart);
  if (elapsed >= bucket.windowMs * 2) return 0;
  if (elapsed >= bucket.windowMs)
    return Math.floor(
      (1 - (elapsed - bucket.windowMs) / bucket.windowMs) * bucket.current,
    );
  return (
    bucket.current +
    Math.floor((1 - elapsed / bucket.windowMs) * bucket.previous)
  );
}
function recoversAt(bucket: UsageBucket, threshold: number, now: number) {
  if (weightedUsage(bucket, now) <= threshold) return null;
  let low = now + 1,
    high = bucket.windowStart + 2 * bucket.windowMs;
  // Counts only decrease if no further requests are made. Find the first
  // millisecond at which the actual weighted allowance crosses the threshold.
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (weightedUsage(bucket, middle) <= threshold) high = middle;
    else low = middle + 1;
  }
  return low;
}
export function usageMeter(
  id: UsageName,
  bucket: UsageBucket | null,
  now: number,
): UsageMeter {
  const limit = RATE_LIMITS[id].limit;
  if (!bucket)
    return {
      id,
      limit,
      remaining: null,
      used: null,
      availableAt: null,
      fullAt: null,
    };
  const remaining = Math.max(
    0,
    Math.min(limit, limit - weightedUsage(bucket, now)),
  );
  return {
    id,
    limit,
    remaining,
    used: limit - remaining,
    availableAt: recoversAt(bucket, limit - 1, now),
    fullAt: recoversAt(bucket, 0, now),
  };
}
export function recoveryCountdown(at: number, now: number) {
  const seconds = Math.max(0, Math.ceil((at - now) / 1000));
  if (!seconds) return "Checking…";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
