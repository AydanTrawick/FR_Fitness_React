import { requireUser, checkOrigin } from "@/lib/server";
import { assistantResponse, assistantError } from "@/lib/assistant/http";
import { transcribeAudio } from "@/lib/assistant/speech";
import { limits } from "@/lib/ratelimit/limiters";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    checkOrigin(request);
    await limits.voice(user.id);
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 5100000)
      return assistantResponse(
        { error: "Record a short clip under 5 MB." },
        413,
      );
    return assistantResponse(
      await transcribeAudio(
        await request.formData(),
        process.env,
        fetch,
        request.signal,
      ),
    );
  } catch (error) {
    return assistantError(error);
  }
}
