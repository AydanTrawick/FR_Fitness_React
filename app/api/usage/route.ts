import { requireAccountSession } from "@/lib/auth-session";
import { limits } from "@/lib/ratelimit/limiters";
import { HttpError } from "@/lib/database";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    Vary: "Cookie",
  };
  try {
    const { user } = await requireAccountSession(request);
    return Response.json(await limits.usage(user.id, request), { headers });
  } catch (error) {
    if (error instanceof HttpError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      );
    return Response.json(
      { error: "Usage could not be loaded. Please try again." },
      { status: 503, headers },
    );
  }
}
