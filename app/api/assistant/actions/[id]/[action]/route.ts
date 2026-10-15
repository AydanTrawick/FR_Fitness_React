import { z } from "zod";
import { revalidateTag } from "next/cache";
import { checkOrigin, requireUser, rateLimit } from "@/lib/server";
import { actionRequest, changeAction } from "@/lib/assistant/actions";
import { assistantResponse, assistantError } from "@/lib/assistant/http";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; action: string }> },
) {
  try {
    const user = await requireUser();
    checkOrigin(request);
    rateLimit(`assistant-action:${user.id}`, 120);
    const params = await context.params,
      id = z.string().uuid().parse(params.id),
      operation = z.enum(["confirm", "cancel"]).parse(params.action);
    const body = actionRequest.parse(await request.json());
    const result = await changeAction(
      user,
      id,
      body.conversationId,
      operation,
      body.payload,
    );
    if (result.status === "confirmed")
      revalidateTag(`analysis-${user.id}`, { expire: 0 });
    const conflict =
      result.status === "expired" ||
      (result.status === "cancelled" && operation === "confirm");
    return assistantResponse(
      conflict
        ? {
            ...result,
            error: `This draft is ${result.status}. Send a new logging request.`,
          }
        : result,
      conflict ? 409 : 200,
    );
  } catch (e) {
    return assistantError(e);
  }
}
