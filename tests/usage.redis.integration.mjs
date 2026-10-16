// Only uniquely named fixture counters are written; never touches account data
// or other users' counters. Compares display values to real SDK enforcement.
import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { createRateLimits } from "../lib/ratelimit/core.ts";
import { RATE_LIMITS } from "../lib/ratelimit/config.ts";
import {
  USAGE_LIMIT_NAMES,
  windowMilliseconds,
} from "../lib/ratelimit/usage.ts";
for (const path of [".env.local", ".env"]) {
  try {
    loadEnvFile(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
if (
  !process.env.UPSTASH_REDIS_REST_URL ||
  !process.env.UPSTASH_REDIS_REST_TOKEN
)
  throw new Error(
    "Save the Upstash variables privately before running this check.",
  );
const redis = Redis.fromEnv({
  retry: { retries: 0 },
  signal: () => AbortSignal.timeout(1000),
});
const user = `usage-test-${randomUUID()}`,
  keys = [],
  warnings = [];
const clients = Object.fromEntries(
  USAGE_LIMIT_NAMES.map((name) => [
    name,
    new Ratelimit({
      redis,
      prefix: RATE_LIMITS[name].prefix,
      limiter: Ratelimit.slidingWindow(
        RATE_LIMITS[name].limit,
        RATE_LIMITS[name].window,
      ),
      analytics: false,
      ephemeralCache: false,
    }),
  ]),
);
const limits = createRateLimits({ redis, warn: (s) => warnings.push(s) });
const request = new Request("https://example.invalid/api/usage", {
  headers: { "x-real-ip": user },
});
try {
  for (const name of USAGE_LIMIT_NAMES) {
    const rule = RATE_LIMITS[name],
      ms = windowMilliseconds(rule.window),
      current = Math.floor(Date.now() / ms);
    for (const [bucket, value] of [
      [current, 3],
      [current - 1, 2],
    ]) {
      const key = `${rule.prefix}:${user}:${bucket}`;
      keys.push(key);
      await redis.set(key, value, { px: 2 * ms + 1000 });
    }
  }
  const before = await Promise.all(
    USAGE_LIMIT_NAMES.map((name) => clients[name].getRemaining(user)),
  );
  const initialValues = await redis.mget(...keys);
  const snapshot = await limits.usage(user, request);
  const after = await Promise.all(
    USAGE_LIMIT_NAMES.map((name) => clients[name].getRemaining(user)),
  );
  assert.equal(snapshot.available, true);
  assert.equal(warnings.length, 0);
  for (let i = 0; i < USAGE_LIMIT_NAMES.length; i++) {
    const meter = snapshot.meters[i];
    assert(
      meter.remaining >= before[i].remaining &&
        meter.remaining <= after[i].remaining,
      `${meter.id} must match the SDK's monotonic remaining allowance`,
    );
    assert(meter.fullAt > snapshot.checkedAt);
  }
  assert.deepEqual(
    await redis.mget(...keys),
    initialValues,
    "Viewing usage must not spend credits or change counters",
  );
  console.log(
    "Live usage snapshot matches all six SDK allowances; counters are unchanged by reads.",
  );
} catch (error) {
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : "Redis usage verification unavailable. No credentials were printed.",
  );
  process.exitCode = 1;
} finally {
  try {
    if (keys.length) await redis.del(...keys);
  } catch {
    console.warn(
      "Usage test-key cleanup unavailable; fixture keys expire automatically.",
    );
  }
}
