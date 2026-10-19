import { unstable_cache } from "next/cache";
import { db } from "../server";
import catalog from "../exercises.json";
import { computeMetrics } from "./metrics";
import { getInsights } from "./insights";
import { activityIndex, analysisSet, entrySessions } from "./activity";
import { canonicalCatalog, type TaxonomyExercise } from "../exercise-taxonomy";
import type {
  AnalysisData,
  RawData,
  Range,
  BodyMetric,
  LibraryItem,
  Schedule,
} from "./types";
type Row = Record<string, unknown>;
const byId = new Map(catalog.map((e) => [e.id, e]));
export async function fetchRaw(userId: string): Promise<RawData> {
  const sql = db();
  const catalogRows = await sql<
    TaxonomyExercise[]
  >`SELECT id,name,primary_muscle,primary_muscles,secondary_muscles,movement_pattern,force,category,source FROM exercises`;
  const fallback = catalog.map((e) => ({
    id: e.id,
    name: e.name,
    primary_muscle: e.primary,
    secondary_muscles: e.secondary,
  }));
  const index = activityIndex([...fallback, ...canonicalCatalog(catalogRows)]);
  const groups = await Promise.allSettled([
    sql`SELECT
   (SELECT coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb) FROM firstrep_workout_entries w WHERE user_id=${userId}) AS legacy,
   (SELECT coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('sets', (SELECT coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) FROM firstrep_set_logs l WHERE l.session_id=s.id))), '[]'::jsonb) FROM firstrep_workout_sessions s WHERE user_id=${userId}) AS sessions,
   (SELECT coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM firstrep_scheduled_sessions p WHERE user_id=${userId}) AS schedule`,
    sql`SELECT recorded_at AS date, weight_kg AS weight FROM firstrep_bmi_readings WHERE user_id=${userId} ORDER BY recorded_at`,
    sql`SELECT f.exercise_id AS id, 'exercise' AS kind, e.name, NULL::timestamptz AS "savedAt"
        FROM firstrep_favorite_exercises f JOIN exercises e ON e.id=f.exercise_id WHERE f.user_id=${userId}
      UNION ALL SELECT id::text, 'workout', name, created_at FROM firstrep_saved_workouts WHERE user_id=${userId}`,
  ]);
  const raw: RawData = {
    sessions: [],
    body: [],
    schedule: [],
    library: [],
    errors: [],
  };
  if (groups[0].status === "fulfilled") {
    const data = groups[0].value[0];
    raw.sessions = (data.sessions as Row[]).map((s) => ({
      id: String(s.id),
      startedAt: String(s.started_at),
      completedAt: s.completed_at ? String(s.completed_at) : null,
      planId: s.plan_id ? String(s.plan_id) : null,
      sets: (s.sets as Row[]).map((row) => analysisSet(row, index)),
    }));
    raw.sessions.push(...entrySessions(data.legacy as Row[], index));
    raw.schedule = (data.schedule as Row[]).map(
      (s) =>
        ({
          date: String(s.scheduled_at),
          sessionId: s.session_id ? String(s.session_id) : null,
        }) satisfies Schedule,
    );
  } else {
    console.error("Analysis activity query failed", groups[0].reason);
    raw.errors.push("activity");
  }
  if (groups[1].status === "fulfilled")
    raw.body = groups[1].value.map(
      (r) =>
        ({
          date: String(r.date),
          weight: Number(r.weight),
        }) satisfies BodyMetric,
    );
  else {
    console.error("Analysis body query failed", groups[1].reason);
    raw.errors.push("body");
  }
  if (groups[2].status === "fulfilled") {
    const items = groups[2].value.map((r) => {
      const exercise =
        r.kind === "exercise" ? index.get(String(r.id)) : undefined;
      return {
        id: exercise?.id ?? String(r.id),
        name:
          exercise?.name ??
          String(r.name ?? byId.get(String(r.id))?.name ?? r.id),
        kind: r.kind as LibraryItem["kind"],
        savedAt: r.savedAt ? String(r.savedAt) : null,
      };
    });
    raw.library = [
      ...new Map(
        items.map((item) => [item.kind + "|" + item.id, item]),
      ).values(),
    ];
  } else {
    console.error("Analysis library query failed", groups[2].reason);
    raw.errors.push("library");
  }
  return raw;
}
export async function getAnalysisData(
  userId: string,
  range: Range,
  timezone: string,
  unit: "kg" | "lb",
): Promise<AnalysisData> {
  const raw = await unstable_cache(
    () => fetchRaw(userId),
    ["analysis-v2", userId, range],
    { revalidate: 300, tags: [`analysis-${userId}`] },
  )();
  const metrics = computeMetrics(raw, range, timezone);
  return {
    range,
    timezone,
    unit,
    metrics,
    insights: raw.errors.includes("activity") ? [] : getInsights(metrics),
    errors: raw.errors,
  };
}
