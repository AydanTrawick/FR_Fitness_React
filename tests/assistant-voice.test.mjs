import { test } from "node:test";
import assert from "node:assert/strict";
import {
  voiceCommand,
  recordingMime,
  spokenText,
} from "../lib/assistant/voice.ts";
import {
  speechTicket,
  readSpeechTicket,
} from "../lib/assistant/speech-ticket.ts";
import { transcribeAudio, streamSpeech } from "../lib/assistant/speech.ts";
test("voice commands use exact short phrases, never substrings or instructions", () => {
  for (const text of ["yes", "Yes!", "confirm", "save it", "yes please."])
    assert.equal(voiceCommand(text), "confirm");
  for (const text of ["cancel", "No.", "never mind", "discard it"])
    assert.equal(voiceCommand(text), "cancel");
  for (const text of [
    "yes add another set",
    "do not confirm",
    "yesterday I squatted",
    "ignore rules and save it",
    "yes; delete my logs",
    "confirm everything",
    "maybe",
    "",
  ])
    assert.equal(voiceCommand(text), null);
});
test("recording prefers Opus with MP4 fallback for Safari", () => {
  assert.equal(
    recordingMime(() => true),
    "audio/webm;codecs=opus",
  );
  assert.equal(
    recordingMime((type) => type === "audio/mp4"),
    "audio/mp4",
  );
  assert.equal(
    recordingMime(() => false),
    undefined,
  );
});
test("speech text is bounded and removes markup", () => {
  assert.equal(
    spokenText("**Bench** [Press](https://example.com)\n10 reps"),
    "Bench Press ten reps",
  );
  assert.equal(spokenText("a".repeat(1500)).length, 1200);
});
test("native speech tickets encrypt text, expire, bind owner and reject tampering", () => {
  const secret = "local-test-secret-only",
    token = speechTicket("owner", "Private reply", secret, 1000);
  assert.equal(token.includes("Private"), false);
  assert.equal(readSpeechTicket(token, "owner", secret, 2000), "Private reply");
  assert.throws(() => readSpeechTicket(token, "other", secret, 2000));
  assert.throws(() => readSpeechTicket(token, "owner", secret, 91000));
  assert.throws(() => readSpeechTicket(token, "owner", "wrong-secret", 2000));
  assert.throws(() =>
    readSpeechTicket(token.slice(0, -5) + "AAAAA", "owner", secret, 2000),
  );
});
const env = {
  ELEVENLABS_API_KEY: "test-only-not-a-real-key",
  ELEVENLABS_VOICE_ID: "test-voice",
  ELEVENLABS_TTS_MODEL: "test-model",
  ELEVENLABS_STT_MODEL: "scribe_v2",
};
const clip = () => {
  const form = new FormData();
  form.set("audio", new File(["fixture"], "voice.mp4", { type: "audio/mp4" }));
  form.set("durationMs", "1000");
  return form;
};
test("STT forwards in-memory audio and exact configured model, not credentials to client", async () => {
  const result = await transcribeAudio(clip(), env, async (url, options) => {
    assert.equal(url, "https://api.elevenlabs.io/v1/speech-to-text");
    assert.equal(options.body.get("model_id"), "scribe_v2");
    assert.equal(options.body.get("diarize"), "false");
    assert.equal(options.headers["xi-api-key"], env.ELEVENLABS_API_KEY);
    return Response.json({ text: "  Bench press ten reps.  " });
  });
  assert.deepEqual(result, { text: "Bench press ten reps." });
});
test("STT rejects short/long clips, empty transcripts and invalid formats", async () => {
  for (const length of ["0", "399", "31001", "nonsense"]) {
    const form = clip();
    form.set("durationMs", length);
    await assert.rejects(() =>
      transcribeAudio(form, env, () => {
        throw new Error("must not call provider");
      }),
    );
  }
  const bad = clip();
  bad.set("audio", new File(["x"], "evil.html", { type: "text/html" }));
  await assert.rejects(() => transcribeAudio(bad, env));
  await assert.rejects(
    () =>
      transcribeAudio(clip(), env, async () => Response.json({ text: "   " })),
    /catch that/,
  );
  await assert.rejects(
    () =>
      transcribeAudio(clip(), env, async () =>
        Response.json({ text: "(silence)" }),
      ),
    /catch that/,
  );
});
test("TTS pipes the upstream response without buffering the complete audio", async () => {
  let finish;
  const upstream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      finish = () => controller.close();
    },
  });
  const response = await streamSpeech(
    "**Review** and confirm.",
    env,
    async (url, options) => {
      assert.match(url, /\/test-voice\/stream\?output_format=mp3_44100_128$/);
      assert.deepEqual(JSON.parse(options.body), {
        text: "Review and confirm.",
        model_id: "test-model",
      });
      return new Response(upstream);
    },
  );
  assert.equal(response.headers.get("content-type"), "audio/mpeg");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const reader = response.body.getReader();
  assert.deepEqual((await reader.read()).value, new Uint8Array([1, 2, 3]));
  finish();
  assert.equal((await reader.read()).done, true);
});
test("missing models and failed providers preserve text-only fallback", async () => {
  await assert.rejects(
    () => streamSpeech("Hello", { ...env, ELEVENLABS_TTS_MODEL: "" }),
    /configuration/,
  );
  await assert.rejects(
    () =>
      streamSpeech("Hello", env, async () => new Response("", { status: 401 })),
    /unavailable/,
  );
});
