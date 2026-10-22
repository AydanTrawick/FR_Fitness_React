import { z } from "zod";
import { checkOrigin, db, HttpError, requireUser } from "@/lib/server";
import { activitySchema } from "@/lib/achievements/activity";
import { achievementState } from "@/lib/achievements/server";
import { localDate } from "@/lib/analysis/metrics";
async function handle(request: Request) {
  try {
    if (request.method !== "GET") checkOrigin(request);
    const user = await requireUser();
    if (request.method === "POST") {
      const body = await request.json();
      if (body.action !== "sync") {
        const id = z.string().uuid().parse(body.id);
        const activity = activitySchema.parse(body);
        if (
          activity.date >
          localDate(new Date().toISOString(), user.timezone || "UTC")
        )
          throw new HttpError("Activity cannot be logged in the future.");
        const sql = db();
        if (activity.kind === "nutrition" || activity.kind === "schedule")
          await sql`INSERT INTO firstrep_achievement_activity(id,user_id,date,kind,data) VALUES (${id},${user.id},${activity.date},${activity.kind},${JSON.stringify(activity)}::text::jsonb) ON CONFLICT(user_id,date,kind) WHERE kind IN ('nutrition','schedule') DO UPDATE SET data=excluded.data`;
        else
          await sql`INSERT INTO firstrep_achievement_activity(id,user_id,date,kind,data) VALUES (${id},${user.id},${activity.date},${activity.kind},${JSON.stringify(activity)}::text::jsonb) ON CONFLICT(id) DO NOTHING`;
      }
    }
    return Response.json(
      await achievementState(user, request.method === "POST"),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (!(error instanceof HttpError) && !(error instanceof z.ZodError))
      console.error(
        "Achievement storage failed",
        error instanceof Error ? error.message : "Unknown error",
      );
    return Response.json(
      {
        error:
          error instanceof z.ZodError
            ? error.issues.map((i) => i.message).join(" ")
            : error instanceof HttpError
              ? error.message
              : "Achievements are temporarily unavailable. Please try again.",
      },
      {
        status:
          error instanceof z.ZodError
            ? 400
            : error instanceof HttpError
              ? error.status
              : 503,
      },
    );
  }
}
export const GET = handle;
export const POST = handle;
