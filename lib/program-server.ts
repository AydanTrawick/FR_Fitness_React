import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, HttpError, type User } from "./server";
import { programs } from "./program-data";
import {
  effectiveExercises,
  target,
  weekStart,
  type ProgramExercise,
} from "./programs";
import { sessionNotes } from "./workout-session";
const slot = z.number().int().min(0).max(99);
const programFields = { programId: z.string().max(50) };
export const programAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("bookmark"),
    ...programFields,
    bookmarked: z.boolean(),
  }),
  z.object({
    action: z.literal("swap"),
    ...programFields,
    day: slot,
    exercise: slot,
    alternative: z.number().int().min(-1).max(99),
  }),
  z.object({ action: z.literal("start"), ...programFields, day: slot }),
  z.object({ action: z.literal("complete"), sessionId: z.uuid() }),
  z.object({
    action: z.literal("log"),
    sessionId: z.uuid(),
    exercise: slot,
    set: slot,
    weightKg: z.number().min(0).max(1000),
    value: z.number().int().min(1).max(100000),
    rpe: z.number().min(1).max(10).multipleOf(0.5),
  }),
]);
function userDate(user: User) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: user.timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return {
    date,
    week: weekStart(date),
    unit: user.weightUnit === "kg" ? "kg" : "lb",
  };
}
export async function programState(user: User) {
  const sql = db(),
    { date, week, unit } = userDate(user);
  const [preferences, sessions, sets, last] = await Promise.all([
    sql`SELECT program_id,bookmarked,swaps FROM firstrep_program_preferences WHERE user_id=${user.id}`,
    sql`SELECT id,program_id,day_index,completed_at,exercises FROM firstrep_program_sessions WHERE user_id=${user.id} AND week_start=${week}`,
    sql`SELECT p.id,p.session_id,p.exercise_index,p.set_index,p.weight_kg,p.reps,p.duration_seconds,p.distance_m,p.rpe FROM firstrep_program_sets p JOIN firstrep_program_sessions s ON s.id=p.session_id WHERE s.user_id=${user.id} AND s.week_start=${week} ORDER BY p.exercise_index,p.set_index`,
    sql`SELECT DISTINCT ON (COALESCE(exercise_id,exercise)) exercise,exercise_id,weight_kg,reps FROM firstrep_workout_entries WHERE user_id=${user.id} ORDER BY COALESCE(exercise_id,exercise),date DESC,performed_at DESC NULLS LAST,id DESC`,
  ]);
  return {
    unit,
    date,
    weekStart: week,
    preferences,
    last,
    sessions: sessions.map((s) => ({
      ...s,
      sets: sets
        .filter((p) => p.session_id === s.id)
        .map((p) => ({ ...p, rpe: Number(p.rpe) })),
    })),
  };
}
export async function mutateProgram(
  user: User,
  input: z.infer<typeof programAction>,
) {
  const sql = db(),
    { date, week, unit } = userDate(user);
  await sql.begin(async (tx) => {
    // Share the workout-log lock so individual set writes and whole-log edits cannot race.
    await tx`SELECT id FROM firstrep_users WHERE id=${user.id} FOR UPDATE`;
    if (
      input.action === "bookmark" ||
      input.action === "start" ||
      input.action === "swap"
    ) {
      const program = programs.find((p) => p.id === input.programId);
      if (!program) throw new HttpError("Program not found.", 404);
      if (input.action === "bookmark") {
        await tx`INSERT INTO firstrep_program_preferences(user_id,program_id,bookmarked) VALUES(${user.id},${program.id},${input.bookmarked}) ON CONFLICT(user_id,program_id) DO UPDATE SET bookmarked=EXCLUDED.bookmarked`;
        return;
      }
      if (!program.schedule[input.day])
        throw new HttpError("Day not found.", 404);
      const [pref] =
        await tx`SELECT swaps FROM firstrep_program_preferences WHERE user_id=${user.id} AND program_id=${program.id}`;
      const swaps = { ...(pref?.swaps || {}) };
      if (input.action === "swap") {
        const original = program.schedule[input.day].exercises[input.exercise];
        if (
          !original ||
          (input.alternative !== -1 &&
            !original.alternatives[input.alternative])
        )
          throw new HttpError("Alternative not found.", 404);
        const [session] =
          await tx`SELECT id,exercises FROM firstrep_program_sessions WHERE user_id=${user.id} AND program_id=${program.id} AND day_index=${input.day} AND week_start=${week}`;
        if (session) {
          const used =
            await tx`SELECT id FROM firstrep_program_sets WHERE session_id=${session.id} AND exercise_index=${input.exercise} LIMIT 1`;
          if (used.length)
            throw new HttpError(
              "Choose a swap before logging sets for this exercise.",
              409,
            );
        }
        const key = `${input.day}:${input.exercise}`;
        if (input.alternative === -1) delete swaps[key];
        else swaps[key] = input.alternative;
        await tx`INSERT INTO firstrep_program_preferences(user_id,program_id,swaps) VALUES(${user.id},${program.id},${JSON.stringify(swaps)}::text::jsonb) ON CONFLICT(user_id,program_id) DO UPDATE SET swaps=EXCLUDED.swaps`;
        if (session) {
          const exercises = session.exercises as ProgramExercise[];
          exercises[input.exercise] = effectiveExercises(
            program,
            input.day,
            swaps,
          )[input.exercise];
          await tx`UPDATE firstrep_program_sessions SET exercises=${JSON.stringify(exercises)}::text::jsonb WHERE id=${session.id}`;
        }
        return;
      }
      await tx`INSERT INTO firstrep_program_sessions(id,user_id,program_id,day_index,week_start,date,unit,exercises) VALUES(${randomUUID()},${user.id},${program.id},${input.day},${week},${date},${unit},${JSON.stringify(effectiveExercises(program, input.day, swaps))}::text::jsonb) ON CONFLICT(user_id,program_id,day_index,week_start) DO NOTHING`;
      return;
    }
    const [session] =
      await tx`SELECT * FROM firstrep_program_sessions WHERE id=${input.sessionId} AND user_id=${user.id} FOR UPDATE`;
    if (!session) throw new HttpError("Workout session not found.", 404);
    if (session.week_start !== week)
      throw new HttpError(
        "This session belongs to a previous week. Start this week’s workout.",
        409,
      );
    if (input.action === "complete") {
      await tx`UPDATE firstrep_program_sessions SET completed_at=COALESCE(completed_at,NOW()),completion_reason=COALESCE(completion_reason,'manual') WHERE id=${session.id}`;
      return;
    }
    const exercises = session.exercises as ProgramExercise[],
      exercise = exercises[input.exercise];
    if (!exercise || input.set >= exercise.sets)
      throw new HttpError("Set not found.", 404);
    const [existing] =
      await tx`SELECT id FROM firstrep_program_sets WHERE session_id=${session.id} AND exercise_index=${input.exercise} AND set_index=${input.set}`;
    if (existing) return; // A retry after a lost response must never add another workout row.
    const kind = target(exercise.reps).kind;
    if (
      input.value >
      (kind === "reps" ? 1000 : kind === "duration" ? 86400 : 100000)
    )
      throw new HttpError("Set value is too large.");
    const entryId = kind === "reps" ? randomUUID() : null;
    if (entryId) {
      const program = programs.find((p) => p.id === session.program_id)!;
      const notes = sessionNotes("", {
        id: session.id,
        name: `${program.title} · ${program.schedule[session.day_index].title}`.slice(
          0,
          120,
        ),
        unit: session.unit,
        startedAt: new Date(session.started_at).toISOString(),
      });
      await tx`INSERT INTO firstrep_workout_entries(id,user_id,date,exercise,exercise_id,sets,reps,weight_kg,rpe,notes,performed_at) VALUES(${entryId},${user.id},${date},${exercise.name},${exercise.exerciseId},1,${input.value},${input.weightKg},${input.rpe},${notes},NOW())`;
    }
    await tx`INSERT INTO firstrep_program_sets(id,user_id,session_id,exercise_index,set_index,weight_kg,reps,duration_seconds,distance_m,rpe,workout_entry_id) VALUES(${randomUUID()},${user.id},${session.id},${input.exercise},${input.set},${input.weightKg},${kind === "reps" ? input.value : null},${kind === "duration" ? input.value : null},${kind === "distance" ? input.value : null},${input.rpe},${entryId})`;
    const [count] =
      await tx`SELECT COUNT(*)::int AS total FROM firstrep_program_sets WHERE session_id=${session.id}`;
    if (count.total === exercises.reduce((n, e) => n + e.sets, 0))
      await tx`UPDATE firstrep_program_sessions SET completed_at=COALESCE(completed_at,NOW()),completion_reason=COALESCE(completion_reason,'sets') WHERE id=${session.id}`;
  });
  return programState(user);
}
