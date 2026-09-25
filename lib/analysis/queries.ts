import { unstable_cache } from "next/cache";
import { db } from "../server";
import catalog from "../exercises.json";
import { computeMetrics } from "./metrics";
import { getInsights } from "./insights";
import { movementPattern } from "./catalog";
import type {
  AnalysisData,
  RawData,
  Range,
  Session,
  SetLog,
  BodyMetric,
  LibraryItem,
  Schedule,
  Pattern,
} from "./types";
type Row = Record<string, unknown>;
const byId = new Map(catalog.map((e) => [e.id, e]));
const byName = new Map(catalog.map((e) => [e.name.toLowerCase(), e]));
function set(row: Row): SetLog {
  const e =
    byId.get(String(row.exercise_id)) ??
    byName.get(String(row.exercise ?? "").toLowerCase());
  // Unknown movement metadata stays unknown; don't infer a training pattern from a name.
  const metadata = e as (typeof e & { movement_pattern?: Pattern }) | undefined;
  return {
    exerciseId: e?.id ?? String(row.exercise_id ?? row.exercise),
    name: e?.name ?? String(row.exercise ?? row.exercise_id),
    primary: e?.primary ?? "Unclassified",
    secondary: e?.secondary ?? [],
    pattern:
      metadata?.movement_pattern ?? (e ? movementPattern[e.id] : null) ?? null,
    reps: row.reps == null ? null : Number(row.reps),
    weight:
      (row.weight ?? row.weight_kg) == null
        ? null
        : Number(row.weight ?? row.weight_kg),
    warmup: row.is_warmup === true,
    count: Number(row.sets ?? 1),
  };
}
export async function fetchRaw(userId: string): Promise<RawData> {
  const sql = db();
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
      sets: (s.sets as Row[]).map(set),
    }));
    const days = new Map<string, Session>();
    for (const r of data.legacy as Row[]) {
      const d = String(r.date).slice(0, 10);
      const session = days.get(d) ?? {
        id: `legacy-${d}`,
        startedAt: d + "T12:00:00Z",
        completedAt: d + "T12:00:00Z",
        dateOnly: d,
        legacy: true,
        sets: [],
      };
      session.sets.push(set(r));
      days.set(d, session);
    }
    raw.sessions.push(...days.values());
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
  if (groups[2].status === "fulfilled")
    raw.library = groups[2].value.map((r) => ({
      id: String(r.id),
      name: String(r.name ?? byId.get(String(r.id))?.name ?? r.id),
      kind: r.kind as LibraryItem["kind"],
      savedAt: r.savedAt ? String(r.savedAt) : null,
    }));
  else {
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
    ["analysis-v1", userId, range],
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
