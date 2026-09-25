import { db, requireUser, HttpError } from "@/lib/server";
import { scoreMuscles, type MuscleRow } from "@/lib/muscle-heatmap";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const range = new URL(request.url).searchParams.get("range") ?? "7d";
    if (range !== "7d" && range !== "30d")
      return Response.json({ error: "Range must be 7d or 30d." }, { status: 400 });
    const days = range === "7d" ? 7 : 30;
    const rows = await db()<MuscleRow[]>`
      SELECT e.name, e.primary_muscles, e.secondary_muscles, logs.sets
      FROM (
        SELECT exercise_id, sets::numeric AS sets
        FROM firstrep_workout_entries
        WHERE user_id = ${user.id} AND performed_at >= now() - ${days} * interval '1 day'
          AND exercise_id IS NOT NULL
        UNION ALL
        SELECT exercise_id, 1::numeric AS sets
        FROM firstrep_set_logs
        WHERE user_id = ${user.id} AND performed_at >= now() - ${days} * interval '1 day'
      ) logs
      JOIN exercises e ON e.id = logs.exercise_id
    `;
    return Response.json(
      { range, muscles: scoreMuscles(rows) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof HttpError ? error.message : "Muscle analysis is temporarily unavailable." },
      { status: error instanceof HttpError ? error.status : 503 },
    );
  }
}
