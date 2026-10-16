import { revalidateTag } from "next/cache";
import { checkOrigin, requireUser } from "@/lib/server";
import { chatInput } from "@/lib/assistant/schema";
import { spokenText } from "@/lib/assistant/voice";
import { limits } from "@/lib/ratelimit/limiters";
import { assistantChat } from "@/lib/assistant/chat";
import { assistantResponse, assistantError } from "@/lib/assistant/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    checkOrigin(request);
    const body = chatInput.parse(await request.json());
    await limits.voice(user.id);
    const result = await assistantChat(user, body);
    if ("actionResult" in result && result.actionResult?.status === "confirmed")
      revalidateTag(`analysis-${user.id}`, { expire: 0 });
    return assistantResponse({
      ...result,
      ...(!(await limits.tts(user.id, spokenText(result.replyText), false))
        ? { ttsLimited: true }
        : {}),
    });
  } catch (e) {
    return assistantError(e);
  }
}
