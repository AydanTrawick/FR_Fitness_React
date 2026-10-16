import { Redis } from "@upstash/redis";
import { db } from "@/lib/database";
import { RATE_INFRA } from "../ratelimit/config";
// The library calls this atomic operation for every endpoint. Postgres is the
// durable fallback; Redis keeps the same limits across serverless instances.
export const sharedRateStorage = {
  async consume(key: string, rule: { window: number; max: number }) {
    if (
      process.env.UPSTASH_REDIS_REST_URL &&
      process.env.UPSTASH_REDIS_REST_TOKEN
    ) {
      try {
        const redis = Redis.fromEnv({
          retry: { retries: 0 },
          signal: () => AbortSignal.timeout(RATE_INFRA.timeoutMs),
        });
        const result = (await redis.eval(
          `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return {n,redis.call('TTL',KEYS[1])}`,
          ["firstrep:auth:" + key],
          [rule.window],
        )) as [number, number];
        return {
          allowed: result[0] <= rule.max,
          retryAfter: result[0] > rule.max ? Math.max(1, result[1]) : null,
        };
      } catch {
        // Better Auth's other endpoints (including get-session and two-factor)
        // must not undo a successful fail-open login during a Redis outage.
        console.warn(
          "[rate-limit] Legacy auth storage: Redis unavailable; allowing request.",
        );
        return { allowed: true, retryAfter: null };
      }
    }
    const rows =
      await db()`INSERT INTO firstrep_auth_limits(key,count,expires_at) VALUES (${key},1,NOW()+${rule.window}*INTERVAL '1 second') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN firstrep_auth_limits.expires_at<=NOW() THEN 1 ELSE firstrep_auth_limits.count+1 END, expires_at=CASE WHEN firstrep_auth_limits.expires_at<=NOW() THEN NOW()+${rule.window}*INTERVAL '1 second' ELSE firstrep_auth_limits.expires_at END RETURNING count, GREATEST(1, EXTRACT(EPOCH FROM expires_at-NOW())) AS retry_after`;
    return {
      allowed: rows[0].count <= rule.max,
      retryAfter:
        rows[0].count > rule.max
          ? Math.ceil(Number(rows[0].retry_after))
          : null,
    };
  },
};
