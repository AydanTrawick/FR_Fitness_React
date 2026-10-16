import assert from "node:assert/strict";
import { createRateLimits } from "../../lib/ratelimit/core.ts";
import { RATE_LIMITS } from "../../lib/ratelimit/config.ts";
// Deterministic Redis/limiter adapters. Exercise the application guards without
// external accounts, real mail, database mutations or billable provider calls.
export function fixture({ fault, gate } = {}) {
  let now = 1_800_000_000_000;
  const counters = new Map(),
    locks = new Map(),
    calls = [],
    warnings = [];
  const duration = (name) => {
    const [count, unit] = RATE_LIMITS[name].window.split(" ");
    return Number(count) * { m: 60000, h: 3600000, d: 86400000 }[unit];
  };
  const limits = createRateLimits({
    env: {},
    warn: (message) => warnings.push(message),
    redis: {
      async set(key, value, options) {
        assert.equal(options.ex, 60);
        assert.equal(options.nx, true);
        if (fault) throw new Error("private-connection-details");
        if (locks.has(key)) return null;
        locks.set(key, value);
        return "OK";
      },
      async eval(script, [key], [owner]) {
        calls.push({
          name: script.includes("'EXPIRE'") ? "lockRenew" : "lockRelease",
          key,
        });
        if (fault) throw new Error("private-connection-details");
        if (locks.get(key) !== owner) return 0;
        if (script.includes("'DEL'")) locks.delete(key);
        return 1;
      },
    },
    makeLimiter(name) {
      const rule = RATE_LIMITS[name];
      const read = (key) => {
        const id = `${name}:${key}`,
          entry = counters.get(id);
        if (!entry || entry.reset <= now) {
          const value = { used: 0, reset: now + duration(name) };
          counters.set(id, value);
          return value;
        }
        return entry;
      };
      return {
        async limit(key, { rate }) {
          calls.push({ name, key, rate });
          await gate?.(name);
          if (fault === "throw") throw new Error("private-connection-details");
          if (fault === "hang") return new Promise(() => {});
          if (fault === "sdk-timeout")
            return {
              success: true,
              reset: now,
              pending: Promise.resolve(),
              reason: "timeout",
            };
          const entry = read(key);
          const success = entry.used + rate <= rule.limit;
          if (success) entry.used += rate;
          return {
            success,
            reset: entry.reset,
            remaining: Math.max(0, rule.limit - entry.used),
            pending: Promise.resolve(),
          };
        },
        async getRemaining(key) {
          if (fault) throw new Error("private-connection-details");
          const entry = read(key);
          return { remaining: rule.limit - entry.used, reset: entry.reset };
        },
        async resetUsedTokens(key) {
          counters.delete(`${name}:${key}`);
        },
      };
    },
  });
  return {
    limits,
    calls,
    counters,
    locks,
    warnings,
    advance: (ms) => {
      now += ms;
    },
  };
}
export const request = (ip = "203.0.113.1", path = "sign-in/email") =>
  new Request(`https://example.test/api/auth/${path}`, {
    method: "POST",
    headers: { "x-real-ip": ip },
  });
