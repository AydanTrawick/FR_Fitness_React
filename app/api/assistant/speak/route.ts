import { z } from "zod";
import { requireUser, checkOrigin, HttpError } from "@/lib/server";
import { assistantResponse, assistantError } from "@/lib/assistant/http";
import { streamSpeech } from "@/lib/assistant/speech";
import { speechTicket, readSpeechTicket } from "@/lib/assistant/speech-ticket";
import { limitVoice } from "@/lib/assistant/voice-limit";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    checkOrigin(request);
    const body = z
      .object({
        replyText: z.string().trim().min(1).max(1200),
        transport: z.enum(["stream", "native"]).default("stream"),
      })
      .strict()
      .parse(await request.json());
    if (body.transport === "native") {
      await limitVoice(user.id, "speech-prepare");
      if (!process.env.BETTER_AUTH_SECRET)
        throw new HttpError("Speech playback is unavailable.", 503);
      return assistantResponse({
        url:
          "/api/assistant/speak?ticket=" +
          speechTicket(user.id, body.replyText, process.env.BETTER_AUTH_SECRET),
      });
    }
    await limitVoice(user.id, "speak");
    return await streamSpeech(
      body.replyText,
      process.env,
      fetch,
      request.signal,
    );
  } catch (error) {
    return assistantError(error);
  }
}
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    checkOrigin(request);
    await limitVoice(user.id, "speak");
    let text: string;
    try {
      text = readSpeechTicket(
        new URL(request.url).searchParams.get("ticket") ?? "",
        user.id,
        process.env.BETTER_AUTH_SECRET ?? "",
      );
    } catch {
      throw new HttpError(
        "Speech playback expired. Tap Listen to try again.",
        400,
      );
    }
    return await streamSpeech(text, process.env, fetch, request.signal);
  } catch (error) {
    return assistantError(error);
  }
}
