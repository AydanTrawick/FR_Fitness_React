import { requireUser, HttpError } from "@/lib/server";
import { scoreMuscles, type MuscleRow } from "@/lib/muscle-heatmap";

import { fetchRaw } from "@/lib/analysis/queries";
import { localDate } from "@/lib/analysis/metrics";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const range = new URL(request.url).searchParams.get("range") ?? "7d";
    if (range !== "7d" && range !== "30d")
      return Response.json(
        { error: "Range must be 7d or 30d." },
        { status: 400 },
      );
    const days = range === "7d" ? 7 : 30;
    const raw = await fetchRaw(user.id);
    if (raw.errors.includes("activity"))
      throw new HttpError("Muscle analysis is temporarily unavailable.", 503);
    const timezone = user.timezone || "UTC";
    const today = Date.parse(
      localDate(new Date().toISOString(), timezone) + "T00:00:00Z",
    );
    const rows: MuscleRow[] = raw.sessions
      .filter((session) => {
        const date = session.dateOnly ?? localDate(session.startedAt, timezone);
        const age = (today - Date.parse(date + "T00:00:00Z")) / 86400000;
        return session.completedAt && age >= 0 && age < days;
      })
      .flatMap((session) =>
        session.sets
          .filter((set) => !set.warmup)
          .map((set) => ({
            name: set.name,
            primary_muscles: set.primaryMuscles ?? [set.primary],
            secondary_muscles: set.secondary,
            sets: set.count,
          })),
      );
    return Response.json(
      { range, muscles: scoreMuscles(rows) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof HttpError
            ? error.message
            : "Muscle analysis is temporarily unavailable.",
      },
      { status: error instanceof HttpError ? error.status : 503 },
    );
  }
}
