import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, requireUser, HttpError } from "../server";
import { canonicalCatalog } from "../exercise-taxonomy";
import { exerciseImageUrl, type ExerciseRow } from "../exercise-catalog";
import { readSessionNote } from "../workout-session";
import type { Entry } from "../tracking";
import { GROUPS, SESSION } from "./config";
import {
  draftSchema,
  emptyDraft,
  makeExercise,
  classify,
  repBased,
  matchesGroup,
  normalizeSupersets,
  type SessionDraft,
} from "./model";
import {
  historyPlans,
  performances,
  freshGroups,
  nextSplit,
  defaultPlan,
  weeklyCoverage,
  weekStreak,
} from "./history";
export async function sessionCatalog() {
  const rows = await db()<
    ExerciseRow[]
  >`SELECT * FROM exercises ORDER BY name,id`;
  return canonicalCatalog(rows).map((e) => ({
    ...e,
    images: e.images.map(exerciseImageUrl),
  }));
}
async function userContext(userId: string) {
  const sql = db();
  const [catalog, rows, saved, finished, favorites] = await Promise.all([
    sessionCatalog(),
    sql<
      Entry[]
    >`SELECT * FROM firstrep_workout_entries WHERE user_id=${userId} ORDER BY date,performed_at`,
    sql`SELECT * FROM firstrep_saved_workouts WHERE user_id=${userId} ORDER BY last_used_at DESC NULLS LAST,updated_at DESC`,
    sql`SELECT * FROM firstrep_live_sessions WHERE user_id=${userId} AND finished_at IS NOT NULL ORDER BY finished_at DESC`,
    sql`SELECT exercise_id FROM firstrep_favorite_exercises WHERE user_id=${userId}`,
  ]);
  const history = historyPlans(rows as Entry[], catalog);
  for (const s of history) {
    const match = finished.find((f) => String(f.id) === s.id);
    if (match) {
      s.plan = match.plan as SessionDraft;
      s.plan.split = match.split;
      if (
        s.plan.savedWorkoutId &&
        !saved.some((w) => w.id === s.plan.savedWorkoutId)
      )
        s.plan.savedWorkoutId = null;
    }
  }
  const templates = await Promise.all(
    saved.map(async (w) => {
      let plan = w.session_plan as SessionDraft | null;
      if (!plan) {
        const items =
          await sql`SELECT * FROM firstrep_saved_workout_exercises WHERE workout_id=${w.id} ORDER BY position`;
        plan = {
          ...emptyDraft(),
          name: w.name,
          split: w.split,
          source: "saved",
          savedWorkoutId: w.id,
          exercises: items
            .filter((i) => i.mode === "reps")
            .flatMap((i) => {
              const e = catalog.find(
                (e) =>
                  e.id === i.exercise_id || e.aliases?.includes(i.exercise_id),
              );
              if (!e) return [];
              const [min, max] = String(i.reps).split("-").map(Number);
              return [
                {
                  ...makeExercise(e),
                  targetSets: Math.min(10, i.sets),
                  repMin: Math.min(50, min || 8),
                  repMax: Math.min(50, max || min || 8),
                  restOverrideSec: Math.min(180, i.rest),
                  weightKg: i.weight ?? 0,
                },
              ];
            }),
        };
        plan.split = classify(plan.exercises);
      }
      const valid = plan.exercises.filter(
        (e) =>
          e.custom ||
          catalog.some(
            (c) => c.id === e.exerciseId || c.aliases?.includes(e.exerciseId),
          ),
      );
      return {
        id: w.id,
        plan: {
          ...plan,
          exercises: valid,
          source: "saved" as const,
          savedWorkoutId: w.id,
        },
        lastUsedAt: w.last_used_at,
        missing: plan.exercises.length - valid.length,
      };
    }),
  );
  return {
    catalog,
    rows: rows as Entry[],
    history,
    templates,
    favorites: favorites.map((f) => String(f.exercise_id)),
  };
}
let countCache: { at: number; counts: Record<string, number> } | null = null;
export async function sessionApi(request: Request, path: string[]) {
  const user = await requireUser(),
    sql = db(),
    params = new URL(request.url).searchParams;
  if (path[0] === "lobby" && request.method === "GET") {
    const c = await userContext(user.id),
      fresh = freshGroups(c.history),
      split = nextSplit(c.history, fresh);
    const prior = c.history.find((s) => s.plan.split === split)?.plan;
    const saved = c.templates.find((s) => s.plan.split === split)?.plan;
    const plan = {
      ...(prior ?? saved ?? defaultPlan(split, c.catalog.filter(repBased))),
      source: "recommended",
      updatedAt: Date.now(),
    };
    return {
      plan,
      fresh,
      streak: weekStreak(c.history, user.timezone),
      last: c.history[0]
        ? { split: c.history[0].plan.split, at: c.history[0].finishedAt }
        : null,
      repeat: c.history[0]?.plan ?? null,
      saved: c.templates,
      weekly: weeklyCoverage(c.history),
      performance: performances(c.rows, c.catalog),
      favorites: c.favorites,
    };
  }
  if (path[0] === "exercises") {
    if (path[1] === "counts") {
      if (countCache && Date.now() - countCache.at < SESSION.draftMaxAge)
        return countCache.counts;
      const catalog = (await sessionCatalog()).filter(repBased);
      const counts = Object.fromEntries(
        ["All", ...GROUPS].map((g) => [
          g,
          catalog.filter((e) => matchesGroup(e, g)).length,
        ]),
      );
      countCache = { at: Date.now(), counts };
      return counts;
    }
    const c = await userContext(user.id),
      performance = performances(c.rows, c.catalog);
    if (path[1] === "last-performance") {
      const ids = (params.get("ids") ?? "").split(",").slice(0, 30);
      return Object.fromEntries(
        ids.filter((id) => performance[id]).map((id) => [id, performance[id]]),
      );
    }
    if (path[1] === "suggestions") {
      const excluded = (params.get("exclude") ?? "").split(","),
        gear = (params.get("equipment") ?? "").split(",");
      const rank = (id: string, equipment: string | null) => [
        c.favorites.includes(id) ? 0 : 1,
        performance[id] &&
        Date.now() - Date.parse(performance[id].at) <
          SESSION.recentDays * 86400000
          ? 0
          : 1,
        gear.includes(equipment ?? "") ? 0 : 1,
      ];
      return {
        exercises: c.catalog
          .filter(
            (e) =>
              repBased(e) &&
              matchesGroup(e, params.get("group") ?? "") &&
              !excluded.includes(e.id),
          )
          .sort((a, b) => {
            const x = rank(a.id, a.equipment),
              y = rank(b.id, b.equipment);
            return (
              x[0] - y[0] ||
              x[1] - y[1] ||
              x[2] - y[2] ||
              a.name.localeCompare(b.name)
            );
          })
          .slice(0, 3),
      };
    }
  }
  if (path[0] === "saved-workouts" && request.method === "POST") {
    const body = await request.json(),
      parsed = draftSchema.parse(body.plan);
    const plan = {
      ...parsed,
      split:
        parsed.split === "custom" ? classify(parsed.exercises) : parsed.split,
    };
    if (!plan.exercises.length) throw new HttpError("Add a lift first.");
    return sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${user.id + plan.name.toLowerCase()}))`;
      const [existing] =
        await tx`SELECT id FROM firstrep_saved_workouts WHERE user_id=${user.id} AND lower(name)=lower(${plan.name}) FOR UPDATE`;
      if (existing && body.replaceId !== existing.id)
        return { replaceId: existing.id, name: plan.name };
      const id = existing?.id ?? randomUUID();
      if (existing)
        await tx`UPDATE firstrep_saved_workouts SET session_plan=${JSON.stringify(plan)}::text::jsonb,split=${plan.split},updated_at=NOW() WHERE id=${id} AND user_id=${user.id}`;
      else
        await tx`INSERT INTO firstrep_saved_workouts(id,user_id,name,session_plan,split) VALUES(${id},${user.id},${plan.name},${JSON.stringify(plan)}::text::jsonb,${plan.split})`;
      await tx`DELETE FROM firstrep_saved_workout_exercises WHERE workout_id=${id}`;
      for (const [position, e] of plan.exercises.entries())
        if (!e.custom)
          await tx`INSERT INTO firstrep_saved_workout_exercises(workout_id,position,exercise_id,sets,mode,reps,duration,weight,rest,notes) VALUES(${id},${position},${e.exerciseId},${e.targetSets},'reps',${e.repMin === e.repMax ? String(e.repMin) : e.repMin + "-" + e.repMax},30,${e.weightKg},${e.restOverrideSec ?? plan.defaultRestSec},'')`;
      return { saved: true, id };
    });
  }
  if (path[0] === "sessions") {
    if (path.length === 1 && request.method === "POST") {
      const plan = draftSchema.parse(await request.json());
      if (!plan.exercises.length) throw new HttpError("Add a lift first.");
      if (
        JSON.stringify(normalizeSupersets(plan.exercises)) !==
        JSON.stringify(plan.exercises)
      )
        throw new HttpError("Superset members must be adjacent.");
      const key = request.headers.get("Idempotency-Key");
      if (!key || key.length > 200)
        throw new HttpError("Missing start request key.");
      const catalog = await sessionCatalog();
      for (const e of plan.exercises)
        if (
          !e.custom &&
          !catalog.some((c) => c.id === e.exerciseId && repBased(c))
        )
          throw new HttpError(
            "An exercise is no longer available. Refresh your plan.",
          );
      return sql.begin(async (tx) => {
        if (
          plan.savedWorkoutId &&
          !(
            await tx`SELECT id FROM firstrep_saved_workouts WHERE id=${plan.savedWorkoutId} AND user_id=${user.id}`
          ).length
        )
          throw new HttpError("Saved workout not found.", 404);
        const [created] =
          await tx`INSERT INTO firstrep_live_sessions(id,user_id,name,split,source,saved_workout_id,default_rest_sec,plan,idempotency_key) VALUES(${randomUUID()},${user.id},${plan.name},${plan.split},${plan.source},${plan.savedWorkoutId},${plan.defaultRestSec},${JSON.stringify(plan)}::text::jsonb,${key}) ON CONFLICT(user_id,idempotency_key) DO UPDATE SET idempotency_key=excluded.idempotency_key RETURNING id,started_at,finished_at`;
        if (created.finished_at)
          throw new HttpError(
            "This plan has already started. Resume your live session.",
            409,
          );
        for (const [position, e] of plan.exercises.entries())
          await tx`INSERT INTO firstrep_session_exercises(session_id,position,exercise_id,target_sets,rep_min,rep_max,rest_override_sec,superset_group) VALUES(${created.id},${position},${e.custom ? null : e.exerciseId},${e.targetSets},${e.repMin},${e.repMax},${e.restOverrideSec},${e.supersetGroup}) ON CONFLICT DO NOTHING`;
        return { sessionId: created.id };
      });
    }
    const id = z.uuid().parse(path[1]);
    if (request.method === "DELETE") {
      const rows =
        await sql`DELETE FROM firstrep_live_sessions WHERE id=${id} AND user_id=${user.id} AND started_at IS NULL AND finished_at IS NULL RETURNING id`;
      if (!rows.length) {
        const exists =
          await sql`SELECT id FROM firstrep_live_sessions WHERE id=${id} AND user_id=${user.id}`;
        if (exists.length)
          throw new HttpError("An active session cannot be canceled.", 409);
      }
      return { deleted: true };
    }
    if (request.method === "PATCH") {
      const { action } = z
        .object({ action: z.enum(["start", "finish"]) })
        .parse(await request.json());
      return sql.begin(async (tx) => {
        const [session] =
          await tx`SELECT * FROM firstrep_live_sessions WHERE id=${id} AND user_id=${user.id} FOR UPDATE`;
        if (!session) throw new HttpError("Session not found.", 404);
        if (action === "start") {
          if (session.finished_at)
            throw new HttpError("This session has finished.", 409);
          const [row] =
            await tx`UPDATE firstrep_live_sessions SET started_at=COALESCE(started_at,NOW()) WHERE id=${id} RETURNING started_at`;
          if (session.saved_workout_id && !session.started_at)
            await tx`UPDATE firstrep_saved_workouts SET last_used_at=NOW() WHERE id=${session.saved_workout_id} AND user_id=${user.id}`;
          return { startedAt: row.started_at };
        }
        const rows = await tx<
          Entry[]
        >`SELECT * FROM firstrep_workout_entries WHERE user_id=${user.id}`;
        const completed = (rows as Entry[]).filter(
          (r) => readSessionNote(r.notes)?.id === id,
        );
        if (!completed.length)
          throw new HttpError("Complete and save at least one set first.");
        const plan = session.plan as SessionDraft,
          catalog = await sessionCatalog();
        const split =
          plan.source === "scratch" && plan.split !== "custom"
            ? plan.split
            : classify(historyPlans(completed, catalog)[0].completed);
        await tx`UPDATE firstrep_live_sessions SET finished_at=COALESCE(finished_at,NOW()),split=${split} WHERE id=${id}`;
        return { finished: true };
      });
    }
  }
  throw new HttpError("Not found.", 404);
}
