import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
const origin = process.env.ASSISTANT_TEST_BASE_URL || "http://localhost:3026";
const safari = process.env.VOICE_TEST_BROWSER === "webkit";
test.use({
  browserName: safari ? "webkit" : "chromium",
  ...(safari
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
    : {
        channel: "chrome",
        viewport: { width: 1280, height: 900 },
        permissions: ["microphone"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
          ],
        },
      }),
});
test.setTimeout(180000);
const speech = await readFile(
  new URL("./fixtures/assistant-speech.mp3", import.meta.url),
);
async function setup(
  page,
  {
    transcripts = [
      "Add bench press ten reps at 225 pounds to my workout log",
      "yes",
    ],
    fakeRecorder = safari,
  } = {},
) {
  await page.addInitScript(
    ({ fakeRecorder }) => {
      window.voiceStats = {
        stopped: 0,
        paused: 0,
        requested: 0,
        mode: fakeRecorder ? "mp4-fixture" : "real-opus-synthetic",
      };
      const pause = HTMLMediaElement.prototype.pause;
      HTMLMediaElement.prototype.pause = function () {
        window.voiceStats.paused++;
        return pause.call(this);
      };
      if (fakeRecorder) {
        Object.defineProperty(
          Object.getPrototypeOf(navigator.mediaDevices),
          "getUserMedia",
          {
            configurable: true,
            value: async () => {
              window.voiceStats.requested++;
              return {
                getTracks: () => [
                  {
                    stop() {
                      window.voiceStats.stopped++;
                    },
                  },
                ],
              };
            },
          },
        );
        window.MediaRecorder = class {
          static isTypeSupported(type) {
            return type === "audio/mp4";
          }
          constructor(_stream, options) {
            this.mimeType = options?.mimeType || "audio/mp4";
            this.state = "inactive";
          }
          start() {
            this.state = "recording";
          }
          stop() {
            this.state = "inactive";
            this.ondataavailable?.({
              data: new Blob(["fake-audio-fixture"], { type: this.mimeType }),
            });
            setTimeout(() => this.onstop?.(), 0);
          }
        };
      } else {
        // Real Chrome MediaRecorder/Opus, fed a synthetic stream instead of an OS mic.
        Object.defineProperty(
          Object.getPrototypeOf(navigator.mediaDevices),
          "getUserMedia",
          {
            configurable: true,
            value: async () => {
              window.voiceStats.requested++;
              const ctx = new AudioContext(),
                tone = ctx.createOscillator(),
                out = ctx.createMediaStreamDestination();
              tone.connect(out);
              tone.start();
              await ctx.resume();
              for (const track of out.stream.getTracks()) {
                const stop = track.stop.bind(track);
                track.stop = () => {
                  window.voiceStats.stopped++;
                  stop();
                  void ctx.close();
                };
              }
              return out.stream;
            },
          },
        );
      }
    },
    { fakeRecorder },
  );
  const user = {
    id: "fixture",
    display_name: "Voice fixture",
    email: "fixture@example.invalid",
    role: "customer",
    weightUnit: "lb",
    timezone: "America/New_York",
  };
  await page.route("**/api/status", (r) =>
    r.fulfill({
      json: {
        user,
        accounts: true,
        ai: true,
        voice: true,
        voiceInput: true,
        email: false,
        foodSearch: false,
        equipment: false,
        feedbackStorage: false,
      },
    }),
  );
  await page.route("**/api/account", (r) =>
    r.fulfill({ json: { preferences: { aiDataOptIn: false } } }),
  );
  await page.route("**/api/logs", (r) =>
    r.fulfill({ json: { logs: { bmi: [], workout: [], food: [] } } }),
  );
  const stats = {
    transcriptions: 0,
    chats: [],
    speech: 0,
    audioTypes: [],
    saved: 0,
  };
  let draft;
  await page.route("**/api/assistant/transcribe", async (route) => {
    const bytes = route.request().postDataBuffer().toString("utf8");
    stats.audioTypes.push(bytes.includes("audio/mp4") ? "mp4" : "webm");
    const text = transcripts[stats.transcriptions++] ?? "What does RPE mean?";
    await route.fulfill({ json: { text } });
  });
  await page.route("**/api/assistant/chat", async (route) => {
    const body = route.request().postDataJSON();
    stats.chats.push(body);
    if (body.prompt.toLowerCase() === "yes") {
      expect(body.activeActionId).toBe(draft.id);
      expect(body.confirmationPayload.sets[0].weight).toBe(227.5);
      stats.saved++;
      await route.fulfill({
        json: {
          replyText: "Saved to your workout log.",
          pendingActions: [{ ...draft, status: "confirmed" }],
          actionResult: { id: draft.id, status: "confirmed" },
        },
      });
      return;
    }
    if (/bench/i.test(body.prompt)) {
      draft = {
        id: randomUUID(),
        kind: "workout_set",
        status: "pending",
        expires_at: new Date(Date.now() + 1800000).toISOString(),
        payload: {
          exercise_name: "Bench Press",
          exercise_id: "bench",
          sets: [{ reps: 10, weight: 225, unit: "lb", rpe: null }],
          notes: "",
          date: "2026-10-14",
          performed_at: "2026-10-14T20:00:00Z",
        },
      };
      await route.fulfill({
        json: {
          replyText:
            "Bench press, ten reps at 225 pounds. Review the card and say yes to save.",
          pendingActions: [draft],
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        replyText: "RPE is a way to describe how hard a set feels.",
        pendingActions: [],
      },
    });
  });
  await page.route("**/api/assistant/speak**", async (route) => {
    if (route.request().method() === "POST") {
      stats.speech++;
      const body = route.request().postDataJSON();
      if (body.transport === "native") {
        await route.fulfill({
          json: { url: "/api/assistant/speak?ticket=browser-fixture" },
        });
        return;
      }
    }
    await route.fulfill({
      status: 200,
      contentType: "audio/mpeg",
      body: speech,
    });
  });
  await page.goto(origin + "/testing-assistant", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await expect(page.getByRole("textbox", { name: "Your request" })).toBeVisible(
    { timeout: 45000 },
  );
  return stats;
}
async function startTalk(page) {
  const button = page.getByRole("button", {
    name: /Hold to talk|Tap to talk|Try again|Speaking — tap to interrupt/,
  });
  await button.scrollIntoViewIfNeeded();
  if (safari) {
    await button.tap();
  } else {
    const box = await button.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
  }
  try {
    await expect(page.getByRole("button", { name: /Listening —/ })).toBeVisible(
      { timeout: 15000 },
    );
  } catch (error) {
    console.log(
      await page.evaluate(() => ({
        stats: window.voiceStats,
        method: navigator.mediaDevices.getUserMedia.toString(),
        recorder: MediaRecorder.name,
      })),
    );
    throw error;
  }
}
async function finishTalk(page) {
  await page.waitForTimeout(550);
  if (safari) await page.getByRole("button", { name: /Listening —/ }).tap();
  else await page.mouse.up();
}
test("voice routes require authentication", async ({ request }) => {
  for (const route of ["transcribe", "speak"])
    expect(
      (
        await request.post(origin + "/api/assistant/" + route, { data: {} })
      ).status(),
    ).toBe(401);
  expect(
    (
      await request.get(origin + "/api/assistant/speak?ticket=invalid")
    ).status(),
  ).toBe(401);
});
test("record, show transcript, stream reply, interrupt, edit and voice-confirm", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const stats = await setup(page);
  await startTalk(page);
  await finishTalk(page);
  await expect(
    page.getByRole("form", { name: "Review workout log" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByText("Add bench press ten reps at 225 pounds to my workout log", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Speaking — tap to interrupt" }),
  ).toBeVisible({ timeout: 15000 });
  await page
    .getByRole("form", { name: "Review workout log" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.getByLabel("Weight, set 1", { exact: true }).fill("227.5");
  const pausedBefore = await page.evaluate(() => window.voiceStats.paused);
  await startTalk(page);
  await expect
    .poll(() => page.evaluate(() => window.voiceStats.paused))
    .toBeGreaterThan(pausedBefore);
  await finishTalk(page);
  await expect(
    page.getByText("Saved to workout log.", { exact: false }),
  ).toBeVisible({ timeout: 30000 });
  expect(stats.saved).toBe(1);
  expect(stats.chats.every((body) => body.mode === "voice")).toBe(true);
  expect(stats.audioTypes).toEqual(safari ? ["mp4", "mp4"] : ["webm", "webm"]);
  await page.getByRole("button", { name: "Mute spoken replies" }).click();
  await expect(
    page.getByRole("button", { name: "Unmute spoken replies" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  const talkBox = await page
    .getByRole("button", { name: /Hold to talk|Tap to talk/ })
    .boundingBox();
  const sendBox = await page
    .getByRole("button", { name: "Send", exact: true })
    .boundingBox();
  expect(
    Math.abs(talkBox.y + talkBox.height - sendBox.y - sendBox.height),
  ).toBeLessThan(3);
  await page.screenshot({
    path: `test-results/assistant-voice-${safari ? "iphone-webkit" : "chrome"}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("microphone denial keeps typed chat usable", async ({ page }) => {
  const stats = await setup(page);
  await page.evaluate(() =>
    Object.defineProperty(
      Object.getPrototypeOf(navigator.mediaDevices),
      "getUserMedia",
      {
        configurable: true,
        value: async () => {
          throw new DOMException("Denied", "NotAllowedError");
        },
      },
    ),
  );
  const button = page.getByRole("button", { name: /Hold to talk|Tap to talk/ });
  if (safari) await button.tap();
  else {
    const box = await button.boundingBox();
    await page.mouse.move(box.x + 5, box.y + 5);
    await page.mouse.down();
    await page.mouse.up();
  }
  await expect(page.getByText(/Microphone access was denied/)).toBeVisible();
  await page
    .getByRole("textbox", { name: "Your request" })
    .fill("What does RPE mean?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("RPE is a way to describe how hard a set feels.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(stats.transcriptions).toBe(0);
  expect(stats.chats[0].mode).toBe("text");
});
test("short recordings are ignored and a 30-second cap stops the microphone", async ({
  page,
}) => {
  const stats = await setup(page, { fakeRecorder: true });
  await startTalk(page);
  if (safari) await page.getByRole("button", { name: /Listening —/ }).tap();
  else await page.mouse.up();
  await expect(page.getByText(/Didn't catch that/)).toBeVisible();
  expect(stats.transcriptions).toBe(0);
  await page.clock.install();
  await startTalk(page);
  await page.clock.runFor(30050);
  if (!safari) await page.mouse.up();
  await expect.poll(() => stats.transcriptions).toBe(1);
  await expect
    .poll(() => page.evaluate(() => window.voiceStats.stopped))
    .toBeGreaterThan(0);
});
test('Space records outside text inputs and remains typing inside them', async ({page})=>{
 const stats=await setup(page,{fakeRecorder:true,transcripts:['What does RPE mean?']});
 await page.getByRole('button',{name:'Mute spoken replies'}).click();
 await page.getByRole('heading',{name:'Training assistant.'}).click();
 await page.keyboard.down('Space');
 await expect(page.getByRole('button',{name:/Listening —/})).toBeVisible();
 await page.waitForTimeout(550);await page.keyboard.up('Space');
 await expect(page.getByText('RPE is a way to describe how hard a set feels.',{exact:true})).toBeVisible();
 expect(stats.transcriptions).toBe(1);expect(stats.speech).toBe(0);
 const input=page.getByRole('textbox',{name:'Your request'});await input.focus();await page.keyboard.press('Space');
 await expect(input).toHaveValue(' ');expect(stats.transcriptions).toBe(1);
});

test("rate limits explain the actual wait and keep the composer available", async ({ page }) => {
  await setup(page);
  await page.route("**/api/assistant/chat", (route) => route.fulfill({ status: 429, headers: { "Retry-After": "720" }, json: {
    error: "rate_limited", message: "Too many attempts.", retryAfterSeconds: 720, scope: "voice",
  } }));
  await page.getByRole("textbox", { name: "Your request" }).fill("What is RPE?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Try again in 12 min." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
});
test("TTS character allowance pauses audio while keeping text replies visible", async ({ page }) => {
  await setup(page);
  await page.route("**/api/assistant/chat", (route) => route.fulfill({ json: {
    replyText: "Keep your movement controlled.", pendingActions: [], ttsLimited: true,
  } }));
  await page.getByRole("textbox", { name: "Your request" }).fill("What should I focus on?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Keep your movement controlled.", { exact: true })).toBeVisible();
  await expect(page.getByText("Audio is paused for today. Your text replies are still available.", { exact: true })).toBeVisible();
});
test("both streaming and native playback handle a capped TTS response without an audio error", async ({ page }) => {
  await setup(page);
  await page.route("**/api/assistant/speak**", (route) => route.fulfill({ json: {
    replyText: "RPE is a way to describe how hard a set feels.", ttsLimited: true,
  } }));
  await page.getByRole("textbox", { name: "Your request" }).fill("What is RPE?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Listen to this reply", exact: true }).click();
  await expect(page.getByText("Audio is paused for today. Your text replies are still available.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Could not play the reply/)).toHaveCount(0);
});
