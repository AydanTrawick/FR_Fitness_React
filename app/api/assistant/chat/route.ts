import { revalidateTag } from "next/cache";
import { checkOrigin, requireUser, rateLimit } from "@/lib/server";
import { chatInput } from "@/lib/assistant/schema";
import { voiceCommand } from "@/lib/assistant/voice";
import { assistantChat } from "@/lib/assistant/chat";
import { assistantResponse, assistantError } from "@/lib/assistant/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    checkOrigin(request);
    const body = chatInput.parse(await request.json());
    // Confirmation bypasses Claude and should not consume the model quota.
    if (body.mode === "voice" && voiceCommand(body.prompt))
      rateLimit(`assistant-control:${user.id}`, 120);
    else rateLimit(`assistant-chat:${user.id}`, 30);
    const result = await assistantChat(user, body);
    if ("actionResult" in result && result.actionResult?.status === "confirmed")
      revalidateTag(`analysis-${user.id}`, { expire: 0 });
    return assistantResponse(result);
  } catch (e) {
    return assistantError(e);
  }
}
