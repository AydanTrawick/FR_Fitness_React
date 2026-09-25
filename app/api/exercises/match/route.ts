import { z } from "zod";
import { db, HttpError, rateLimit } from "@/lib/server";
import { matchExercise } from "@/lib/exercise-match";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    rateLimit(`exercise-match:${request.headers.get("x-forwarded-for") ?? "local"}`, 2000);
    const { name } = z.object({ name: z.string().trim().min(1).max(300) }).parse({ name: new URL(request.url).searchParams.get("name") });
    const catalog = await db()<{ id: string; name: string }[]>`SELECT id, name FROM exercises`;
    return Response.json(matchExercise(name, catalog), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof HttpError ? error.message : "Could not match that exercise." },
      { status: error instanceof HttpError ? error.status : 400 },
    );
  }
}
