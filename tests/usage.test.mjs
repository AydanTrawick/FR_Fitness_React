import { test } from "node:test";
import assert from "node:assert/strict";
import {
  weightedUsage,
  usageMeter,
  windowMilliseconds,
  USAGE_LIMIT_NAMES,
  recoveryCountdown,
} from "../lib/ratelimit/usage.ts";
import { createRateLimits } from "../lib/ratelimit/core.ts";
import { RATE_LIMITS } from "../lib/ratelimit/config.ts";

test("remaining allowance matches Upstash weighted buckets across a window boundary", () => {
  const bucket = {
    current: 4,
    previous: 8,
    windowStart: 10000,
    windowMs: 1000,
  };
  assert.equal(weightedUsage(bucket, 10000), 12);
  assert.equal(weightedUsage(bucket, 10500), 8);
  assert.equal(weightedUsage(bucket, 10999), 4);
  assert.equal(weightedUsage(bucket, 11000), 4);
  assert.equal(weightedUsage(bucket, 11250), 3);
  assert.equal(weightedUsage(bucket, 11751), 0);
  assert.equal(weightedUsage(bucket, 12000), 0);
  const row = usageMeter("planHour", bucket, 10500);
  assert.equal(row.remaining, 2);
  assert.equal(row.used, 8);
});
test("reset labels predict actual recovery, rather than claiming the next bucket restores everything", () => {
  const bucket = {
    current: 10,
    previous: 8,
    windowStart: 10000,
    windowMs: 1000,
  };
  const row = usageMeter("planHour", bucket, 10500);
  assert.equal(row.remaining, 0);
  assert(row.availableAt > 11000);
  assert(row.fullAt > row.availableAt);
  assert.equal(weightedUsage(bucket, row.availableAt - 1) >= 10, true);
  assert.equal(weightedUsage(bucket, row.availableAt) <= 9, true);
  assert.equal(weightedUsage(bucket, row.fullAt - 1) > 0, true);
  assert.equal(weightedUsage(bucket, row.fullAt), 0);
});
test("character overshoot and previous-only usage recover without negative or fabricated credits", () => {
  const bucket = {
    current: 21000,
    previous: 0,
    windowStart: 0,
    windowMs: 86400000,
  };
  const row = usageMeter("ttsCharacters", bucket, 5000);
  assert.equal(row.remaining, 0);
  assert.equal(row.used, 20000);
  assert.equal(weightedUsage(bucket, row.availableAt) <= 19999, true);
  assert.equal(weightedUsage(bucket, row.availableAt - 1) >= 20000, true);
  const previousOnly = usageMeter(
    "planHour",
    { current: 0, previous: 2, windowStart: 0, windowMs: 1000 },
    1,
  );
  assert.equal(previousOnly.remaining, 9);
  assert(previousOnly.fullAt < 1000);
  assert.equal(previousOnly.availableAt, null);
  const full = usageMeter(
    "planHour",
    { current: 0, previous: 0, windowStart: 0, windowMs: 1000 },
    1,
  );
  assert.equal(full.remaining, 10);
  assert.equal(full.fullAt, null);
});
test("all configured usage windows and countdowns use real durations", () => {
  assert.equal(windowMilliseconds("1 d"), 86400000);
  assert.equal(windowMilliseconds("15 m"), 900000);
  assert.throws(() => windowMilliseconds("2 weeks"));
  assert.equal(recoveryCountdown(720000, 0), "12m");
  assert.equal(recoveryCountdown(500, 0), "1s");
  assert.equal(recoveryCountdown(3600000, 0), "1h 0m");
  assert.equal(recoveryCountdown(0, 1), "Checking…");
});
test("usage reads only the authenticated user's buckets and current network, without spending tokens", async () => {
  const reads = [];
  const limits = createRateLimits({
    env: {},
    redis: {
      async eval(script, keys, args) {
        reads.push(keys);
        assert(script.includes("'GET'"));
        assert(!/INCR|SET|EXPIRE/.test(script));
        assert.deepEqual(args, []);
        return USAGE_LIMIT_NAMES.flatMap(() => [3, 0]);
      },
    },
    makeLimiter() {
      assert.fail("Usage must not invoke a limiter or analytics");
    },
  });
  const request = new Request(
    "https://example.test/api/usage?userId=another-user",
    { headers: { "x-real-ip": "203.0.113.7" } },
  );
  const first = await limits.usage("session-user", request),
    second = await limits.usage("session-user", request);
  assert.equal(first.available, true);
  assert.equal(reads.length, 2);
  assert(reads.flat().every((key) => !key.includes("another-user")));
  for (const name of USAGE_LIMIT_NAMES) {
    const row = first.meters.find((meter) => meter.id === name);
    assert.equal(row.remaining, RATE_LIMITS[name].limit - 3);
    const ownKeys = reads[0].filter((key) =>
      key.startsWith(`${RATE_LIMITS[name].prefix}:`),
    );
    assert.equal(ownKeys.length, 2);
    assert(
      ownKeys.every((key) =>
        key.includes(name === "planIp" ? "203.0.113.7" : "session-user"),
      ),
    );
  }
  assert.deepEqual(
    first.meters.map((m) => m.remaining),
    second.meters.map((m) => m.remaining),
  );
});
test("missing or failed Redis reports unknown usage, never a false full balance", async () => {
  for (const redis of [
    undefined,
    {
      async eval() {
        throw new Error("private Redis details");
      },
    },
    {
      async eval() {
        return ["invalid"];
      },
    },
  ]) {
    const warnings = [];
    const limits = createRateLimits({
      env: {},
      redis,
      warn: (s) => warnings.push(s),
    });
    const snapshot = await limits.usage(
      "session-user",
      new Request("https://example.test"),
    );
    assert.equal(snapshot.available, false);
    assert(
      snapshot.meters.every(
        (row) =>
          row.remaining === null && row.used === null && row.fullAt === null,
      ),
    );
    assert(
      warnings.every((warning) => !warning.includes("private Redis details")),
    );
  }
});

test("paid fetches announce allowance changes on success, throttling and failures; reading usage does not loop", async () => {
  const { usageFetch, USAGE_CHANGED } =
    await import("../lib/ratelimit/usage-client.ts");
  const originalFetch = globalThis.fetch,
    originalWindow = globalThis.window;
  const target = new EventTarget();
  let changes = 0;
  target.addEventListener(USAGE_CHANGED, () => changes++);
  globalThis.window = target;
  try {
    globalThis.fetch = async () =>
      Response.json({ error: "rate_limited" }, { status: 429 });
    await usageFetch("/api/assistant/chat", { method: "POST" });
    assert.equal(changes, 1);
    await usageFetch("/api/usage");
    await usageFetch("/api/account");
    assert.equal(changes, 1);
    globalThis.fetch = async () => Response.json({ text: "Plan" });
    await usageFetch("/api/ai", { method: "POST" });
    assert.equal(changes, 2);
    globalThis.fetch = async () => {
      throw new Error("Network interruption");
    };
    await assert.rejects(
      usageFetch("/api/coach", { method: "POST" }),
      /Network interruption/,
    );
    assert.equal(changes, 3);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
