// Optional live-Redis verification. All keys use a unique test prefix and are
// removed afterward. Never calls Neon, auth, mail, Claude or ElevenLabs.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { createRateLimits } from "../lib/ratelimit/core.ts";
import { RATE_INFRA, RATE_LIMITS } from "../lib/ratelimit/config.ts";
import {
  RateLimitError,
  GenerationBusyError,
} from "../lib/ratelimit/respond.ts";
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
) {
  console.error(
    "Save UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN privately in .env.local or .env first.",
  );
  process.exit(1);
}
const redis = Redis.fromEnv({
  retry: { retries: 0 },
  signal: () => AbortSignal.timeout(RATE_INFRA.timeoutMs),
});
const prefix = `rl:test:${randomUUID()}`,
  user = prefix,
  pending = [],
  warnings = [];
const limits = createRateLimits({
  redis,
  warn: (message) => warnings.push(message),
  defer: (promise) => pending.push(promise),
  makeLimiter(name) {
    const rule = RATE_LIMITS[name];
    return new Ratelimit({
      redis,
      prefix: `${prefix}:${name}`,
      limiter: Ratelimit.slidingWindow(rule.limit, rule.window),
      analytics: true,
      timeout: RATE_INFRA.timeoutMs,
      ephemeralCache: false,
    });
  },
});
const req = new Request("https://example.invalid", {
  method: "POST",
  headers: { "x-real-ip": prefix },
});
try {
  assert.equal(await redis.ping(), "PONG");
  for (let i = 0; i < 5; i++)
    await limits.auth(req, "/sign-in/email", {
      email: `${prefix}@example.invalid`,
    });
  await assert.rejects(
    limits.auth(req, "/sign-in/email", { email: `${prefix}@example.invalid` }),
    RateLimitError,
  );
  await limits.resetLogin(`${prefix}@example.invalid`);
  await limits.auth(req, "/sign-in/email", {
    email: `${prefix}@example.invalid`,
  });
  for (let i = 0; i < 3; i++) await limits.auth(req, "/sign-up/email", {});
  await assert.rejects(limits.auth(req, "/sign-up/email", {}), RateLimitError);
  const release = await limits.beginPlan(user, req);
  await assert.rejects(limits.beginPlan(user, req), GenerationBusyError);
  await release();
  for (let i = 1; i < 10; i++) await (await limits.beginPlan(user, req))();
  await assert.rejects(limits.beginPlan(user, req), RateLimitError);
  for (let i = 0; i < 20; i++) await limits.voice(user);
  await assert.rejects(limits.voice(user), RateLimitError);
  assert.equal(await limits.tts(user, "a".repeat(19990)), true);
  assert.equal(await limits.tts(user, "a".repeat(11)), false);
  assert.equal(
    warnings.length,
    0,
    "Live Redis checks must not pass through fail-open mode.",
  );
  console.log(
    "Live Redis checks passed: login/reset, signup, plan caps and lock, voice cap, weighted TTS characters.",
  );
} catch {
  console.error(
    "Live Redis verification failed. Check credentials, connectivity and Upstash availability. No credential values were printed.",
  );
  process.exitCode = 1;
} finally {
  await Promise.allSettled(pending);
  try {
    let cursor = 0;
    const keys = [];
    do {
      const page = await redis.scan(cursor, {
        match: `${prefix}:*`,
        count: 100,
      });
      cursor = Number(page[0]);
      keys.push(...page[1]);
    } while (cursor);
    for (let i = 0; i < keys.length; i += 100)
      await redis.del(...keys.slice(i, i + 100));
    await redis.del(RATE_INFRA.lockPrefix + user);
  } catch {
    console.warn(
      "Redis test-key cleanup unavailable; rate keys and locks expire automatically.",
    );
  }
}
