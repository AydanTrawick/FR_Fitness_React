import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";
import {
  RATE_INFRA,
  RATE_LIMITS,
  type LimitName,
  type RateScope,
} from "./config.ts";
import { emailKey, getClientIp, userKey } from "./keys.ts";
import { GenerationBusyError, RateLimitError } from "./respond.ts";
import {
  USAGE_LIMIT_NAMES,
  usageMeter,
  windowMilliseconds,
  type UsageSnapshot,
} from "./usage.ts";

type LimitClient = Pick<
  Ratelimit,
  "limit" | "getRemaining" | "resetUsedTokens"
>;
type Options = {
  env?: NodeJS.ProcessEnv;
  redis?: Redis;
  makeLimiter?: (name: LimitName, redis: Redis) => LimitClient;
  defer?: (promise: Promise<unknown>) => void;
  warn?: (message: string) => void;
};
export const GENERIC_MAIL_MESSAGE =
  "If an account exists for that email, we sent a link.";
export function authPolicy(path: string, body: Record<string, unknown>) {
  if (path.startsWith("/sign-in/")) return "login" as const;
  if (path === "/sign-up/email") return "signup" as const;
  if (
    path === "/request-password-reset" ||
    path === "/email-otp/request-password-reset" ||
    (path === "/email-otp/send-verification-otp" &&
      body.type === "forget-password")
  )
    return "reset" as const;
  if (
    path === "/send-verification-email" ||
    path === "/email-otp/send-verification-otp"
  )
    return "verify" as const;
}

export function createRateLimits(options: Options = {}) {
  const warn = options.warn ?? ((message: string) => console.warn(message));
  const warning = (operation: string) =>
    warn(`[rate-limit] ${operation}: Redis unavailable; allowing request.`);
  const env = options.env ?? process.env;
  let redis = options.redis;
  if (!redis && env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      redis = new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
        retry: { retries: 0 },
        signal: () => AbortSignal.timeout(RATE_INFRA.timeoutMs),
      });
    } catch {
      warning("configuration");
    }
  }
  const clients = new Map<LimitName, LimitClient>();
  function client(name: LimitName) {
    if (!redis) return undefined;
    let value = clients.get(name);
    if (!value) {
      const rule = RATE_LIMITS[name];
      value =
        options.makeLimiter?.(name, redis) ??
        new Ratelimit({
          redis,
          prefix: rule.prefix,
          limiter: Ratelimit.slidingWindow(rule.limit, rule.window),
          analytics: true,
          timeout: RATE_INFRA.timeoutMs,
          ephemeralCache: false,
        });
      clients.set(name, value);
    }
    return value;
  }
  async function bounded<T>(
    operation: string,
    run: () => Promise<T>,
  ): Promise<T | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        run(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Redis timeout")),
            RATE_INFRA.timeoutMs,
          );
        }),
      ]);
    } catch {
      // Never log identifiers, request bodies, Redis credentials or provider errors.
      warning(operation);
    } finally {
      clearTimeout(timer);
    }
  }
  async function consume(name: LimitName, key: string, rate = 1) {
    const limiter = client(name);
    if (!limiter) {
      warning(name);
      return undefined;
    }
    const result = await bounded(name, () => limiter.limit(key, { rate }));
    if (result) {
      const pending = result.pending.catch(() => warning(`${name} analytics`));
      if (options.defer) {
        try {
          options.defer(pending);
        } catch {
          void pending;
        }
      } else void pending;
      if (result.reason === "timeout") {
        warning(name);
        return undefined;
      }
    }
    return result;
  }
  async function enforce(scope: RateScope, checks: [LimitName, string][]) {
    const results = await Promise.all(
      checks.map(([name, key]) => consume(name, key)),
    );
    const blocked = results.filter((result) => result && !result.success);
    if (blocked.length)
      throw new RateLimitError(
        Math.max(...blocked.map((r) => r!.reset)),
        scope,
      );
  }
  async function remaining(name: LimitName, key: string) {
    const limiter = client(name);
    if (!limiter) {
      warning(name);
      return undefined;
    }
    return bounded(name, () => limiter.getRemaining(key));
  }
  async function auth(
    request: Request,
    path: string,
    body: Record<string, unknown>,
  ) {
    const scope = authPolicy(path, body),
      ip = getClientIp(request);
    const email = emailKey(
      typeof body.email === "string"
        ? body.email
        : typeof body.username === "string"
          ? body.username
          : "",
    );
    if (scope === "login")
      await enforce(scope, [
        ["loginIp", ip],
        ...(typeof body.email === "string" || typeof body.username === "string"
          ? [["loginEmail", email] as [LimitName, string]]
          : []),
      ]);
    if (scope === "signup") await enforce(scope, [["signupIp", ip]]);
    if (scope === "reset")
      await enforce(scope, [
        ["resetEmail", email],
        ["resetIp", ip],
      ]);
    if (scope === "verify")
      await enforce(scope, [
        ["verifyMinute", email],
        ["verifyDay", email],
      ]);
    return scope;
  }
  async function resetLogin(email: string) {
    const limiter = client("loginEmail");
    if (!limiter) {
      warning("login reset");
      return;
    }
    await bounded("login reset", () =>
      limiter.resetUsedTokens(emailKey(email)),
    );
  }
  async function voice(id: string) {
    const key = userKey(id);
    await enforce("voice", [
      ["voiceMinute", key],
      ["voiceDay", key],
    ]);
  }
  // Preview does not spend characters. Consumption is atomic at the provider
  // boundary, including every native audio GET (a replay cannot bypass billing).
  async function tts(id: string, text: string, spend = true) {
    const key = userKey(id);
    if (!spend) {
      const result = await remaining("ttsCharacters", key);
      return !result || result.remaining >= text.length;
    }
    const result = await consume("ttsCharacters", key, text.length);
    return !result || result.success;
  }
  async function previewVoice(id: string) {
    const key = userKey(id);
    const results = await Promise.all(
      (["voiceMinute", "voiceDay"] as const).map((name) =>
        remaining(name, key),
      ),
    );
    const blocked = results.filter((r) => r && r.remaining < 1);
    if (blocked.length)
      throw new RateLimitError(
        Math.max(...blocked.map((r) => r!.reset)),
        "voice",
      );
  }
  async function beginPlan(id: string, request: Pick<Request, "headers">) {
    const key = userKey(id),
      lockKey = RATE_INFRA.lockPrefix + key,
      token = randomUUID();
    const acquired = redis
      ? await bounded("generation lock", () =>
          redis.set(lockKey, token, {
            nx: true,
            ex: RATE_INFRA.generationLockSeconds,
          }),
        )
      : (warning("generation lock"), undefined);
    if (acquired === null) throw new GenerationBusyError();
    let timer: ReturnType<typeof setInterval> | undefined;
    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      clearInterval(timer);
      if (acquired && redis)
        await bounded("generation unlock", () =>
          redis.eval(
            "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",
            [lockKey],
            [token],
          ),
        );
    };
    try {
      await enforce("plan_builder", [
        ["planHour", key],
        ["planDay", key],
        ["planIp", getClientIp(request)],
      ]);
      if (acquired && redis) {
        timer = setInterval(() => {
          void bounded("generation renewal", () =>
            redis.eval(
              "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('EXPIRE',KEYS[1],ARGV[2]) else return 0 end",
              [lockKey],
              [token, RATE_INFRA.generationLockSeconds],
            ),
          );
        }, RATE_INFRA.generationRenewMs);
        timer.unref?.();
      }
      return release;
    } catch (error) {
      await release();
      throw error;
    }
  }
  async function usage(
    id: string,
    request: Pick<Request, "headers">,
  ): Promise<UsageSnapshot> {
    const now = Date.now(),
      key = userKey(id),
      ip = getClientIp(request);
    const windows = USAGE_LIMIT_NAMES.map((name) =>
      windowMilliseconds(RATE_LIMITS[name].window),
    );
    const keys = USAGE_LIMIT_NAMES.flatMap((name, index) => {
      const window = Math.floor(now / windows[index]);
      const base = `${RATE_LIMITS[name].prefix}:${name === "planIp" ? ip : key}`;
      return [`${base}:${window}`, `${base}:${window - 1}`];
    });
    // One atomic, read-only snapshot of the exact enforcement buckets. Reading
    // usage never spends quota, records analytics, refreshes TTLs or creates keys.
    const counts = redis
      ? await bounded("usage snapshot", () =>
          redis.eval<[], number[]>(
            "local result={} for i,key in ipairs(KEYS) do result[i]=tonumber(redis.call('GET',key) or '0') end return result",
            keys,
            [],
          ),
        )
      : (warning("usage snapshot"), undefined);
    const valid =
      counts?.length === keys.length &&
      counts.every((n) => Number.isFinite(n) && n >= 0);
    return {
      checkedAt: now,
      available: !!valid,
      meters: USAGE_LIMIT_NAMES.map((name, index) =>
        usageMeter(
          name,
          valid
            ? {
                current: counts[index * 2],
                previous: counts[index * 2 + 1],
                windowStart: Math.floor(now / windows[index]) * windows[index],
                windowMs: windows[index],
              }
            : null,
          now,
        ),
      ),
    };
  }
  return { auth, resetLogin, voice, tts, previewVoice, beginPlan, usage };
}
export type RateLimits = ReturnType<typeof createRateLimits>;
