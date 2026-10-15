import { HttpError } from "../database.ts";
import { MIN_CLIP_MS, MAX_CLIP_MS, spokenText } from "./voice.ts";
export async function transcribeAudio(
  form: FormData,
  env: NodeJS.ProcessEnv = process.env,
  send: typeof fetch = fetch,
  signal?: AbortSignal,
) {
  if (!env.ELEVENLABS_API_KEY)
    throw new HttpError(
      "Voice transcription is not configured. You can still type your message.",
      503,
    );
  const audio = form.get("audio"),
    duration = Number(form.get("durationMs"));
  if (
    !(audio instanceof File) ||
    !audio.size ||
    audio.size > 5000000 ||
    !/^audio\/(webm|mp4|mpeg|ogg|wav)(;|$)/i.test(audio.type)
  )
    throw new HttpError("Record a supported audio clip under 5 MB.", 400);
  if (
    !Number.isFinite(duration) ||
    duration < MIN_CLIP_MS ||
    duration > MAX_CLIP_MS + 1000
  )
    throw new HttpError("Record a clip between 0.4 and 30 seconds.", 400);
  const upload = new FormData();
  upload.set("file", audio);
  upload.set("model_id", env.ELEVENLABS_STT_MODEL || "scribe_v2");
  upload.set("tag_audio_events", "false");
  upload.set("diarize", "false");
  upload.set("timestamps_granularity", "none");
  const res = await send("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
    body: upload,
    signal: AbortSignal.any([
      signal ?? new AbortController().signal,
      AbortSignal.timeout(45000),
    ]),
  });
  if (!res.ok)
    throw new HttpError(
      `Transcription is unavailable (${res.status}). Try again or type your message.`,
      502,
    );
  const result = await res.json(),
    text = typeof result.text === "string" ? result.text.trim() : "";
  if (!text || text.length > 10000 || /^(\[[^\]]+\]|\([^)]*\))$/.test(text))
    throw new HttpError("Didn't catch that, try again.", 422);
  return { text };
}
export async function streamSpeech(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
  send: typeof fetch = fetch,
  signal?: AbortSignal,
) {
  if (
    !env.ELEVENLABS_API_KEY ||
    !env.ELEVENLABS_VOICE_ID ||
    !env.ELEVENLABS_TTS_MODEL
  )
    throw new HttpError(
      "Spoken replies need the server’s ElevenLabs voice and TTS model configuration. Text chat still works.",
      503,
    );
  const res = await send(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(env.ELEVENLABS_VOICE_ID)}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": env.ELEVENLABS_API_KEY,
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: spokenText(text),
        model_id: env.ELEVENLABS_TTS_MODEL,
      }),
      signal: AbortSignal.any([
        signal ?? new AbortController().signal,
        AbortSignal.timeout(45000),
      ]),
    },
  );
  if (!res.ok || !res.body)
    throw new HttpError(
      `Spoken reply is unavailable (${res.status}). The text reply is still available.`,
      502,
    );
  return new Response(res.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "none",
    },
  });
}
