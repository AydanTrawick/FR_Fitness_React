import { z } from "zod";
import { db, checkOrigin, HttpError } from "@/lib/server";
import { requireAccountSession } from "@/lib/auth-session";
export const runtime = "nodejs";
async function handle(request: Request) {
  try {
    const { user } = await requireAccountSession(request);
    const sql = db();
    if (request.method === "GET") {
      const rows =
        await sql`SELECT preferences->>'weeklyWorkoutGoal' AS goal FROM firstrep_user_settings WHERE user_id=${user.id}`;
      const goal = Number(rows[0]?.goal);
      return Response.json(
        {
          weeklyWorkoutGoal:
            Number.isInteger(goal) && goal >= 1 && goal <= 14 ? goal : 3,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    checkOrigin(request);
    const { weeklyWorkoutGoal } = z
      .object({ weeklyWorkoutGoal: z.number().int().min(1).max(14) })
      .parse(await request.json());
    const values = JSON.stringify({ weeklyWorkoutGoal });
    await sql`INSERT INTO firstrep_user_settings(user_id,preferences) VALUES (${user.id},${values}::text::jsonb) ON CONFLICT(user_id) DO UPDATE SET preferences=COALESCE(firstrep_user_settings.preferences,'{}'::jsonb)||EXCLUDED.preferences,updated_at=NOW()`;
    return Response.json({ weeklyWorkoutGoal });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof HttpError
            ? error.message
            : "Could not save your workout goal.",
      },
      { status: error instanceof HttpError ? error.status : 400 },
    );
  }
}
export const GET = handle;
export const PATCH = handle;
