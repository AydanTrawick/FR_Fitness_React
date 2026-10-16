import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRateLimits,
  GENERIC_MAIL_MESSAGE,
} from "../lib/ratelimit/core.ts";
import { protectAuthRequest } from "../lib/ratelimit/auth.ts";
import { RATE_INFRA } from "../lib/ratelimit/config.ts";
import { emailKey, getClientIp } from "../lib/ratelimit/keys.ts";
import {
  RateLimitError,
  GenerationBusyError,
  rateErrorResponse,
  rateLimitBody,
} from "../lib/ratelimit/respond.ts";
import { requestError, AUDIO_PAUSED_MESSAGE } from "../lib/ratelimit/client.ts";

import { fixture, request } from "./helpers/ratelimit.mjs";
async function auth(
  f,
  path,
  email,
  provider = () =>
    Response.json(
      { code: "USER_NOT_FOUND", message: "No such account" },
      { status: 401 },
    ),
  ip,
) {
  try {
    return await protectAuthRequest(
      request(ip, path),
      `/${path}`,
      { email },
      f.limits,
      async () => provider(),
    );
  } catch (error) {
    const response = rateErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
async function generate(f, user, provider, ip) {
  const release = await f.limits.beginPlan(user, request(ip));
  try {
    return await provider();
  } finally {
    await release();
  }
}

test("email keys are normalized SHA-256; Vercel's trusted IP takes precedence", () => {
  assert.equal(emailKey(" Aydan@Example.COM "), emailKey("aydan@example.com"));
  assert.match(emailKey("aydan@example.com"), /^[a-f0-9]{64}$/);
  assert.doesNotMatch(emailKey("aydan@example.com"), /aydan|@/);
  assert.equal(
    getClientIp(
      new Request("https://test", {
        headers: {
          "x-real-ip": "1.2.3.4",
          "x-forwarded-for": "9.8.7.6, 1.1.1.1",
        },
      }),
    ),
    "1.2.3.4",
  );
  assert.equal(
    getClientIp(
      new Request("https://test", {
        headers: { "x-forwarded-for": "9.8.7.6, 1.1.1.1" },
      }),
    ),
    "9.8.7.6",
  );
});
test("login: sixth attempt blocked before provider, other email allowed, unknown and real errors identical", async () => {
  const f = fixture();
  let calls = 0;
  const real = () => {
    calls++;
    return Response.json(
      { code: "INVALID_PASSWORD", message: "Wrong password" },
      { status: 401 },
    );
  };
  const missing = () => {
    calls++;
    return Response.json(
      { code: "USER_NOT_FOUND", message: "Unknown user" },
      { status: 400 },
    );
  };
  for (let i = 0; i < 5; i++) {
    const a = await auth(f, "sign-in/email", "real@example.test", real);
    const b = await auth(f, "sign-in/email", "missing@example.test", missing);
    assert.equal(a.status, 401);
    assert.deepEqual(await a.json(), await b.json());
  }
  for (const email of ["real@example.test", "missing@example.test"]) {
    const blocked = await auth(f, "sign-in/email", email, real);
    assert.equal(blocked.status, 429);
    const body = await blocked.json();
    assert.equal(body.scope, "login");
    assert.equal(body.error, "rate_limited");
    assert.equal(
      blocked.headers.get("Retry-After"),
      String(body.retryAfterSeconds),
    );
    assert.deepEqual(Object.keys(body).sort(), [
      "error",
      "message",
      "retryAfterSeconds",
      "scope",
    ]);
  }
  assert.equal(calls, 10);
  assert.equal(
    (await auth(f, "sign-in/email", "another@example.test", real)).status,
    401,
  );
  assert.equal(calls, 11);
  assert(
    f.calls
      .filter((c) => c.name === "loginEmail")
      .every((c) => !c.key.includes("@")),
  );
});
test("login checks IP and email in parallel before entering auth/database code", async () => {
  let resume;
  const gate = new Promise((resolve) => {
    resume = resolve;
  });
  const started = [];
  const f = fixture({
    gate: (name) => {
      started.push(name);
      return gate;
    },
  });
  let providerCalled = false;
  const pending = auth(f, "sign-in/email", "test@example.test", () => {
    providerCalled = true;
    return Response.json({});
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started.sort(), ["loginEmail", "loginIp"]);
  assert.equal(providerCalled, false);
  resume();
  await pending;
  assert.equal(providerCalled, true);
});
test("successful login resets email allowance across IPs, without resetting IP allowance", async () => {
  const f = fixture();
  for (let i = 0; i < 4; i++)
    await auth(f, "sign-in/email", "login@example.test");
  const success = await auth(f, "sign-in/email", " LOGIN@example.test ", () =>
    Response.json({ token: "fixture" }),
  );
  assert.equal(success.status, 200);
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await auth(f, "sign-in/email", "login@example.test")).status,
      401,
    );
  assert.equal(
    (await auth(f, "sign-in/email", "login@example.test")).status,
    429,
  );
  const social = fixture();
  for (let i = 0; i < 20; i++)
    assert.equal(
      (
        await auth(social, "sign-in/social", undefined, () =>
          Response.json({ url: "https://accounts.google.com" }),
        )
      ).status,
      200,
    );
  assert.equal((await auth(social, "sign-in/social", undefined)).status, 429);
  assert.equal(
    (
      await auth(
        social,
        "sign-in/social",
        undefined,
        () => Response.json({}),
        "203.0.113.2",
      )
    ).status,
    200,
  );
});
test("fourth signup on the same IP is blocked, other IP allowed", async () => {
  const f = fixture();
  let sent = 0;
  for (let i = 0; i < 4; i++) {
    const result = await auth(
      f,
      "sign-up/email",
      `user${i}@example.test`,
      () => {
        sent++;
        return Response.json({});
      },
    );
    assert.equal(result.status, i < 3 ? 200 : 429);
  }
  assert.equal(sent, 3);
  assert.equal(
    (
      await auth(
        f,
        "sign-up/email",
        "other@example.test",
        () => Response.json({}),
        "203.0.113.2",
      )
    ).status,
    200,
  );
});
test("reset and verify responses match for present and missing accounts; independent minute and daily limits", async () => {
  for (const path of [
    "request-password-reset",
    "email-otp/request-password-reset",
    "send-verification-email",
    "email-otp/send-verification-otp",
  ]) {
    const f = fixture();
    const present = await auth(f, path, "present@example.test", () =>
      Response.json({ sent: true }),
    );
    const missing = await auth(f, path, "absent@example.test", () =>
      Response.json({ error: "User not found" }, { status: 400 }),
    );
    assert.deepEqual(await present.json(), {
      status: true,
      message: GENERIC_MAIL_MESSAGE,
    });
    assert.deepEqual(await missing.json(), {
      status: true,
      message: GENERIC_MAIL_MESSAGE,
    });
  }
  const f = fixture();
  for (let i = 0; i < 4; i++)
    assert.equal(
      (
        await auth(f, "request-password-reset", "reset@example.test", () =>
          Response.json({}),
        )
      ).status,
      i < 3 ? 200 : 429,
    );
  const v = fixture();
  assert.equal(
    (
      await auth(v, "send-verification-email", "verify@example.test", () =>
        Response.json({}),
      )
    ).status,
    200,
  );
  assert.equal(
    (await auth(v, "send-verification-email", "verify@example.test")).status,
    429,
  );
  const day = fixture();
  for (let i = 0; i < 5; i++) {
    day.advance(61000);
    assert.equal(
      (
        await auth(day, "send-verification-email", "verify@example.test", () =>
          Response.json({}),
        )
      ).status,
      200,
    );
  }
  day.advance(61000);
  assert.equal(
    (await auth(day, "send-verification-email", "verify@example.test")).status,
    429,
  );
});
test("eleventh plan generation is blocked without invoking the LLM; lock releases on success and error", async () => {
  const f = fixture();
  let calls = 0;
  for (let i = 0; i < 10; i++)
    await generate(f, "user", () => {
      calls++;
      return "plan";
    });
  await assert.rejects(
    generate(f, "user", () => {
      calls++;
    }),
    RateLimitError,
  );
  assert.equal(calls, 10);
  assert.equal(f.locks.size, 0);
  const errorFixture = fixture();
  await assert.rejects(
    generate(errorFixture, "user", () => {
      throw new Error("provider down");
    }),
    /provider down/,
  );
  assert.equal(errorFixture.locks.size, 0);
  assert.equal(await generate(errorFixture, "user", () => "retry"), "retry");
});
test("concurrent generation gets 409; stale owner's release cannot delete a new lock", async () => {
  const f = fixture();
  const release = await f.limits.beginPlan("user", request());
  await assert.rejects(
    f.limits.beginPlan("user", request()),
    (error) =>
      error instanceof GenerationBusyError &&
      rateErrorResponse(error).status === 409,
  );
  assert.equal(f.calls.filter((c) => c.name === "planHour").length, 1);
  f.locks.set(RATE_INFRA.lockPrefix + "user", "new-owner");
  await release();
  assert.equal(f.locks.get(RATE_INFRA.lockPrefix + "user"), "new-owner");
});
test("plan daily and backup IP budgets apply across hours and users", async () => {
  const daily = fixture();
  for (let hour = 0; hour < 3; hour++) {
    for (let i = 0; i < 10; i++) await generate(daily, "user", () => "ok");
    daily.advance(3600001);
  }
  await assert.rejects(
    generate(daily, "user", () => assert.fail("LLM called")),
    RateLimitError,
  );
  const ip = fixture();
  for (let i = 0; i < 30; i++) await generate(ip, `user-${i}`, () => "ok");
  await assert.rejects(
    generate(ip, "user-31", () => assert.fail("LLM called")),
    RateLimitError,
  );
});
test("voice shares one minute and daily budget across STT, LLM and TTS, never calls blocked providers", async () => {
  const f = fixture(),
    providers = { stt: 0, llm: 0, tts: 0 };
  const run = async (kind) => {
    await f.limits.voice("user");
    providers[kind]++;
  };
  for (let i = 0; i < 20; i++) await run(["stt", "llm", "tts"][i % 3]);
  for (const kind of ["stt", "llm", "tts"])
    await assert.rejects(run(kind), RateLimitError);
  assert.equal(
    Object.values(providers).reduce((a, b) => a + b),
    20,
  );
  const daily = fixture();
  for (let minute = 0; minute < 10; minute++) {
    for (let i = 0; i < 20; i++) await daily.limits.voice("user");
    daily.advance(61000);
  }
  await assert.rejects(daily.limits.voice("user"), RateLimitError);
});
test("TTS spends exact characters, keeps text with ttsLimited, and previews do not charge native playback twice", async () => {
  const f = fixture();
  let elevenCalls = 0;
  async function speak(text) {
    await f.limits.voice("user");
    if (!(await f.limits.tts("user", text)))
      return { replyText: text, ttsLimited: true };
    elevenCalls++;
    return "audio";
  }
  assert.equal(await f.limits.tts("user", "a".repeat(20000), false), true);
  assert.equal(f.calls.length, 0);
  assert.equal(await speak("a".repeat(19990)), "audio");
  const result = await speak("a".repeat(11));
  assert.deepEqual(result, { replyText: "a".repeat(11), ttsLimited: true });
  assert.equal(elevenCalls, 1);
  assert.deepEqual(
    f.calls.filter((c) => c.name === "ttsCharacters").map((c) => c.rate),
    [19990, 11],
  );
  assert.equal(await f.limits.tts("user", "a".repeat(11), false), false);
});
test("missing, unreachable, stalled, and SDK-timeout Redis all fail open and warn without secrets", async () => {
  for (const fault of ["missing", "throw", "sdk-timeout", "hang"]) {
    const f = fault === "missing" ? { warnings: [] } : fixture({ fault });
    const limits =
      fault === "missing"
        ? createRateLimits({ env: {}, warn: (s) => f.warnings.push(s) })
        : f.limits;
    const response = await protectAuthRequest(
      request(),
      "/sign-in/email",
      { email: "secret@example.test" },
      limits,
      async () => Response.json({ ok: true }),
    );
    assert.equal(response.status, 200);
    await limits.voice("user");
    assert.equal(await limits.tts("user", "reply"), true);
    const release = await limits.beginPlan("user", request());
    await release();
    assert(f.warnings.some((s) => /allowing request/.test(s)));
    assert(
      f.warnings.every(
        (s) =>
          !s.includes("secret@example.test") &&
          !s.includes("private-connection-details"),
      ),
    );
  }
});
test("429 body has safe scope, positive retry seconds, and frontend messages use actual wait", () => {
  assert.deepEqual(rateLimitBody(720000, "login", 0), {
    error: "rate_limited",
    message: "Too many attempts. Try again in 12 minutes.",
    retryAfterSeconds: 720,
    scope: "login",
  });
  assert.match(
    requestError(
      { status: 429 },
      { scope: "plan_builder", retryAfterSeconds: 2400 },
    ).message,
    /40 min/,
  );
  assert.match(
    requestError({ status: 429 }, { scope: "voice", retryAfterSeconds: 12 })
      .message,
    /12 sec/,
  );
  assert.equal(
    requestError({ status: 200 }, { ttsLimited: true }).message,
    AUDIO_PAUSED_MESSAGE,
  );
});

test("long plan generations renew the owned sixty-second lease and stop renewal on release", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const f = fixture();
  const release = await f.limits.beginPlan("long-generation", request());
  t.mock.timers.tick(20_000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.calls.filter((call) => call.name === "lockRenew").length, 1);
  await assert.rejects(
    f.limits.beginPlan("long-generation", request()),
    GenerationBusyError,
  );
  await release();
  t.mock.timers.tick(40_000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.calls.filter((call) => call.name === "lockRenew").length, 1);
  assert.equal(f.locks.size, 0);
});
