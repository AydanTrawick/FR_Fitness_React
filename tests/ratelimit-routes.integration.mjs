// Runs the actual handlers in an isolated module context. Only infrastructure
// boundaries are stubbed: sessions, Redis, DB, mail and paid providers.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SourceTextModule, SyntheticModule } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { fixture, request } from "./helpers/ratelimit.mjs";
import { protectAuthRequest } from "../lib/ratelimit/auth.ts";
import { authPolicy } from "../lib/ratelimit/core.ts";
import { RATE_INFRA } from "../lib/ratelimit/config.ts";
import * as respond from "../lib/ratelimit/respond.ts";
import { spokenText } from "../lib/assistant/voice.ts";
class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
let user = { id: "route-user" },
  f,
  providerCalls,
  authStatus = 401,
  dbFault = false;
const headers = { "x-real-ip": "203.0.113.1" };
const reset = () => {
  dbFault = false;
  f = fixture();
  providerCalls = { llm: 0, stt: 0, tts: 0, auth: 0, db: 0 };
  user = { id: "route-user" };
};
const limits = Object.fromEntries(
  [
    "auth",
    "resetLogin",
    "voice",
    "tts",
    "previewVoice",
    "beginPlan",
    "usage",
  ].map((key) => [key, (...args) => f.limits[key](...args)]),
);
const server = {
  HttpError,
  checkOrigin() {},
  requireUser: async () => {
    if (!user) throw new HttpError("Sign in first.", 401);
    return user;
  },
  currentUser: async () => user,
  db: () => async () => {
    providerCalls.db++;
    if (dbFault) throw new Error("Audit storage down");
    return [{ count: 1 }];
  },
  providerFetch: async (url) => {
    if (url.includes("anthropic")) {
      providerCalls.llm++;
      return Response.json({ content: [{ type: "text", text: "Your plan." }] });
    }
    if (url.includes("speech-to-text")) {
      providerCalls.stt++;
      return Response.json({ text: "Hello" });
    }
    providerCalls.tts++;
    return new Response("audio");
  },
  rateLimit() {},
  feedbackStorageEnabled: () => false,
  sendMail: async () => {},
  uploadFeedback: async () => {},
};
const assistantResponse = (data, status = 200) =>
  Response.json(data, { status });
const assistantError = (error) =>
  respond.rateErrorResponse(error) ??
  assistantResponse({ error: error.message }, error.status ?? 500);
const stubs = {
  "../ratelimit/respond": respond,
  "../database": { HttpError },
  "@/lib/ratelimit/limiters": { limits },
  "@/lib/ratelimit/respond": respond,
  "@/lib/ratelimit/auth": { protectAuthRequest },
  "@/lib/ratelimit/core": { authPolicy },
  "@/lib/server": server,
  "@/lib/database": { db: server.db, HttpError },
  "@/lib/auth/origin": {
    authRequestOrigins: () => ["https://example.test"],
    getAuthURL: () => "https://example.test",
  },
  "@/lib/auth": {
    getAuth: () => ({
      handler: async () => {
        providerCalls.auth++;
        return Response.json(
          { code: authStatus === 401 ? "INVALID_PASSWORD" : undefined },
          { status: authStatus },
        );
      },
    }),
  },
  "@/lib/auth/mail": { accountMail: async () => {} },
  "next/server": { after: () => {} },
  "@/lib/exercise-server": { exerciseApi() {} },
  "@/lib/ai-plan-builder": { PLAN_BUILDER_SYSTEM: "Plan" },
  "next/cache": { revalidateTag() {} },
  zod: { z },
  "@/lib/tracking": {
    columns: {},
    metadataColumns: {},
    tables: {},
    kinds: [],
    validateEntry() {},
  },
  "@/lib/assistant/http": { assistantResponse, assistantError },
  "@/lib/assistant/schema": { chatInput: z.object({ prompt: z.string() }) },
  "@/lib/assistant/voice": { spokenText },
  "@/lib/assistant/chat": {
    assistantChat: async () => {
      providerCalls.llm++;
      return { replyText: "Good work.", pendingActions: [] };
    },
  },
  "@/lib/assistant/speech": {
    transcribeAudio: async () => {
      providerCalls.stt++;
      return { text: "Hello" };
    },
    streamSpeech: async () => {
      providerCalls.tts++;
      return new Response("audio", {
        headers: { "Content-Type": "audio/mpeg" },
      });
    },
  },
  "@/lib/assistant/speech-ticket": {
    speechTicket: () => "fixture-ticket",
    readSpeechTicket: () => "Good work.",
  },
};
stubs["@/lib/auth-session"] = {
  requireAccountSession: async () => ({ user: await server.requireUser() }),
};
stubs["@anthropic-ai/sdk"] = { default: class {} };
stubs["@/lib/progress/model"] = {
  anthropic: () => assert.fail("Model called after quota"),
  coachModel: "fixture",
  toolSchema: () => ({}),
};
stubs["@/lib/progress/schema"] = { goalSchema: z.object({}) };
stubs["@/lib/progress/safety"] = {
  needsSupport: () => false,
  SUPPORT_MESSAGE: "Support",
};
stubs["@/lib/progress/service"] = Object.fromEntries(
  [
    "acquireLease",
    "draftGoal",
    "latestPlaybook",
    "profileAndWeight",
    "proposeAdjustment",
    "saveMessage",
    "coachLimit",
    "confirmGoal",
    "localDate",
    "progressState",
    "reviewAdjustment",
    "saveCheckin",
  ].map((name) => [
    name,
    name === "acquireLease"
      ? async () => async () => {}
      : async () => assert.fail(`Unexpected service ${name}`),
  ]),
);
stubs["@/lib/progress/photos"] = Object.fromEntries(
  [
    "deleteAllPhotos",
    "photoConsent",
    "photoStorageReady",
    "servePhoto",
    "signedPhotoUrl",
    "uploadPhoto",
  ].map((name) => [
    name,
    () => assert.fail(`Unexpected photo service ${name}`),
  ]),
);
stubs["../ratelimit/config"] = { RATE_INFRA };
stubs["@upstash/redis"] = {
  Redis: {
    fromEnv: () => ({
      eval: async () => {
        throw new Error("Redis down");
      },
    }),
  },
};
async function load(path) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const routeModule = new SourceTextModule(compiled, { identifier: path });
  await routeModule.link(async (specifier) => {
    const values = stubs[specifier];
    assert(values, `Unexpected dependency ${specifier} in ${path}`);
    const stub = new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values))
        this.setExport(key, value);
    });
    return stub;
  });
  await routeModule.evaluate();
  return routeModule.namespace;
}
function post(path, data) {
  return new Request(`https://example.test/api/${path}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
const previous = { ...process.env };
Object.assign(process.env, {
  ANTHROPIC_API_KEY: "fixture",
  ELEVENLABS_API_KEY: "fixture",
  ELEVENLABS_VOICE_ID: "fixture",
  BETTER_AUTH_SECRET: "fixture",
  NEON_DATABASE_URL: "fixture",
});
try {
  stubs["@/lib/assistant/http"] = await load("lib/assistant/http.ts");
  const usageRoute = await load("app/api/usage/route.ts");
  const main = await load("app/api/[...path]/route.ts");
  const chat = await load("app/api/assistant/chat/route.ts");
  const stt = await load("app/api/assistant/transcribe/route.ts");
  const tts = await load("app/api/assistant/speak/route.ts");
  const auth = await load("app/api/auth/[...all]/route.ts");
  const coach = await load("app/api/coach/route.ts");
  const progress = await load("app/api/progress/[[...path]]/route.ts");
  const context = (path) => ({ params: Promise.resolve({ path: [path] }) });
  reset();
  user = null;
  for (const [route, body] of [
    ["ai", { mode: "plan", prompt: "Make a plan" }],
    ["speech", { text: "Hello" }],
    ["transcribe", {}],
  ])
    assert.equal(
      (await main.POST(post(route, body), context(route))).status,
      401,
    );
  for (const route of [chat, stt, tts])
    assert.equal((await route.POST(post("assistant", {}))).status, 401);
  assert.equal(
    (
      await usageRoute.GET(
        new Request("https://example.test/api/usage?userId=somebody-else"),
      )
    ).status,
    401,
  );
  assert.equal(f.calls.length, 0);
  assert.deepEqual(providerCalls, { llm: 0, stt: 0, tts: 0, auth: 0, db: 0 });
  assert.equal(
    (await coach.POST(post("coach", { prompt: "Plan" }))).status,
    401,
  );
  assert.equal(
    (
      await progress.POST(
        post("progress/goals/confirm", {
          id: "d879c01c-e7e4-42b3-95ce-9fedceaa6b29",
        }),
        { params: Promise.resolve({ path: ["goals", "confirm"] }) },
      )
    ).status,
    401,
  );
  reset();
  const ownUsage = await usageRoute.GET(
    new Request("https://example.test/api/usage?userId=somebody-else"),
  );
  assert.equal(ownUsage.status, 200);
  assert.match(ownUsage.headers.get("Cache-Control"), /private, no-store/);
  assert.equal(ownUsage.headers.get("Vary"), "Cookie");
  assert.equal((await ownUsage.json()).available, false);
  assert(f.calls.every((call) => !call.key.includes("somebody-else")));
  reset();
  for (let i = 0; i < 11; i++) {
    const response = await main.POST(
      post("ai", { mode: "plan", prompt: "Make a plan" }),
      context("ai"),
    );
    assert.equal(response.status, i < 10 ? 200 : 429);
    if (i === 10) {
      assert.equal((await response.json()).scope, "plan_builder");
      assert(response.headers.has("Retry-After"));
    }
  }
  assert.equal(providerCalls.llm, 10);
  assert.equal(f.locks.size, 0);
  assert.equal(
    (await coach.POST(post("coach", { prompt: "Plan" }))).status,
    429,
  );
  assert.equal(
    (
      await progress.POST(
        post("progress/goals/confirm", {
          id: "d879c01c-e7e4-42b3-95ce-9fedceaa6b29",
        }),
        { params: Promise.resolve({ path: ["goals", "confirm"] }) },
      )
    ).status,
    429,
  );
  assert.equal(providerCalls.llm, 10);
  reset();
  const release = await f.limits.beginPlan(user.id, request());
  assert.equal(
    (
      await main.POST(
        post("ai", { mode: "plan", prompt: "Make a plan" }),
        context("ai"),
      )
    ).status,
    409,
  );
  assert.equal(providerCalls.llm, 0);
  await release();
  reset();
  for (let i = 0; i < 20; i++)
    assert.equal(
      (await chat.POST(post("assistant/chat", { prompt: "What is RPE?" })))
        .status,
      200,
    );
  for (const route of [chat, stt, tts]) {
    const response = await route.POST(
      post(
        "assistant",
        route === chat
          ? { prompt: "Hello" }
          : route === tts
            ? { replyText: "Hello" }
            : {},
      ),
    );
    assert.equal(response.status, 429);
    assert.equal((await response.json()).scope, "voice");
  }
  for (const route of ["speech", "transcribe"])
    assert.equal(
      (await main.POST(post(route, { text: "Hello" }), context(route))).status,
      429,
    );
  assert.deepEqual(providerCalls, { llm: 20, stt: 0, tts: 0, auth: 0, db: 0 });
  reset();
  await f.limits.tts(user.id, "a".repeat(20000));
  const reply = await chat.POST(post("assistant/chat", { prompt: "Hello" }));
  assert.deepEqual(await reply.json(), {
    replyText: "Good work.",
    pendingActions: [],
    ttsLimited: true,
  });
  for (const transport of ["stream", "native"]) {
    const response = await tts.POST(
      post("assistant/speak", { replyText: "Good work.", transport }),
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ttsLimited, true);
  }
  const native = await tts.GET(
    new Request("https://example.test/api/assistant/speak?ticket=fixture"),
  );
  assert.equal(native.status, 200);
  assert.equal((await native.json()).ttsLimited, true);
  assert.equal(providerCalls.tts, 0);
  reset();
  for (let i = 0; i < 6; i++)
    assert.equal(
      (
        await auth.POST(
          post("auth/sign-in/email", {
            email: "fixture@example.test",
            password: "incorrect",
          }),
        )
      ).status,
      i < 5 ? 401 : 429,
    );
  assert.equal(providerCalls.auth, 5);
  assert.equal(providerCalls.db, 5);
  reset();
  const normal = await tts.POST(
    post("assistant/speak", { replyText: "Good work." }),
  );
  assert.equal(normal.status, 200);
  assert.equal(normal.headers.get("Content-Type"), "audio/mpeg");
  assert.equal(providerCalls.tts, 1);
  reset();
  dbFault = true;
  const failedWithAuditDown = await auth.POST(
    post("auth/sign-in/email", {
      email: "audit@example.test",
      password: "fixture",
    }),
  );
  assert.equal(failedWithAuditDown.status, 401);
  assert.equal(
    (await failedWithAuditDown.json()).message,
    "Invalid email or password",
  );
  authStatus = 200;
  assert.equal(
    (
      await auth.POST(
        post("auth/sign-in/email", {
          email: "audit@example.test",
          password: "fixture",
        }),
      )
    ).status,
    200,
  );
  authStatus = 401;
  dbFault = false;
  const legacy = await load("lib/auth/rate-storage.ts");
  process.env.UPSTASH_REDIS_REST_URL = "https://fixture.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fixture";
  assert.deepEqual(
    await legacy.sharedRateStorage.consume("session-fixture", {
      window: 60,
      max: 60,
    }),
    { allowed: true, retryAfter: null },
  );
  console.log(
    "Rate-limit route acceptance passed. Actual auth, AI, STT, chat and TTS handlers; no live providers or database touched.",
  );
} finally {
  for (const key of Object.keys(process.env))
    if (!(key in previous)) delete process.env[key];
  Object.assign(process.env, previous);
}
