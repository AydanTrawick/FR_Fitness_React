import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, HttpError } from "../database.ts";
import { matchAssistantExercise } from "./exercise.ts";
import {
  prepareWorkout,
  prepareFood,
  type PendingAction,
  type WorkoutPayload,
  type FoodPayload,
} from "./schema.ts";
export type Actor = { id: string; timezone?: string; weightUnit?: string };
const context = (user: Actor) => ({
  now: new Date(),
  timezone: user.timezone || "UTC",
  unit: user.weightUnit,
});
export async function resolveWorkout(input: unknown, user: Actor, sql = db()) {
  const payload = prepareWorkout(input, context(user));
  if (payload.custom) return { ...payload, exercise_id: null };
  const catalog = await sql<
    { id: string; name: string }[]
  >`SELECT id,name FROM exercises`;
  const match = payload.exercise_id
    ? catalog.find((e) => e.id === payload.exercise_id)
    : matchAssistantExercise(payload.exercise_name, catalog).match;
  if (!match)
    throw new HttpError(
      "Choose the matching catalog exercise or select “Use custom name” before confirming.",
      409,
    );
  return {
    ...payload,
    exercise_id: match.id,
    exercise_name: match.name,
    custom: false,
  };
}
export async function createAction(
  user: Actor,
  conversationId: string,
  key: string,
  kind: "food" | "workout_set",
  input: unknown,
  sql = db(),
  source: "text" | "voice" = "text",
): Promise<PendingAction> {
  const payload =
    kind === "food"
      ? prepareFood(input, context(user))
      : await resolveWorkout(input, user, sql);
  const rows =
    await sql`INSERT INTO pending_log_actions(user_id,conversation_id,kind,source,payload,idempotency_key) VALUES(${user.id},${conversationId},${kind},${source},${JSON.stringify(payload)}::jsonb,${key}) ON CONFLICT(idempotency_key) DO NOTHING RETURNING id,kind,status,payload,expires_at`;
  const row =
    rows[0] ??
    (
      await sql`SELECT id,kind,status,payload,expires_at FROM pending_log_actions WHERE user_id=${user.id} AND conversation_id=${conversationId} AND idempotency_key=${key}`
    )[0];
  if (!row)
    throw new HttpError("Action key conflict. Please try a new request.", 409);
  return row as PendingAction;
}
export async function changeAction(
  user: Actor,
  id: string,
  conversationId: string,
  operation: "confirm" | "cancel",
  input?: unknown,
  sql = db(),
  latestOnly = false,
) {
  // Same owner lock as tracker list writes, followed by the draft lock. This
  // prevents confirmation racing a whole-list tracker replacement.
  return sql.begin(async (tx) => {
    await tx`SELECT id FROM firstrep_users WHERE id=${user.id} FOR UPDATE`;
    const [action] =
      await tx`SELECT * FROM pending_log_actions WHERE id=${id} AND user_id=${user.id} AND conversation_id=${conversationId} FOR UPDATE`;
    if (!action) throw new HttpError("Draft not found.", 404);
    if (action.status === "confirmed")
      return {
        status: "confirmed",
        kind: action.kind,
        resultIds: action.result_ids,
      };
    if (latestOnly && action.status === "pending") {
      const [latest] =
        await tx`SELECT id FROM pending_log_actions WHERE user_id=${user.id} AND conversation_id=${conversationId} AND status='pending' AND expires_at>NOW() ORDER BY created_at DESC,id DESC LIMIT 1`;
      if (latest && latest.id !== id)
        throw new HttpError(
          "Review the most recent draft before saying yes or cancel. Use the card for another draft.",
          409,
        );
    }
    if (action.status !== "pending")
      return { status: action.status, kind: action.kind, resultIds: [] };
    if (new Date(action.expires_at).getTime() <= Date.now()) {
      await tx`UPDATE pending_log_actions SET status='expired' WHERE id=${id}`;
      return { status: "expired", kind: action.kind, resultIds: [] };
    }
    if (operation === "cancel") {
      await tx`UPDATE pending_log_actions SET status='cancelled' WHERE id=${id}`;
      return { status: "cancelled", kind: action.kind, resultIds: [] };
    }
    const raw = input ?? action.payload;
    const resultIds: string[] = [];
    let confirmedPayload: WorkoutPayload | FoodPayload;
    if (action.kind === "food") {
      const p = prepareFood(raw, context(user));
      confirmedPayload = p;
      const rowId = randomUUID();
      await tx`INSERT INTO firstrep_food_entries(id,user_id,date,food,protein_g,carbs_g,fat_g,meal,calories,values_source,source) VALUES(${rowId},${user.id},${p.log_date!},${p.food_name},${p.protein_g ?? null},${p.carbs_g ?? null},${p.fat_g ?? null},${p.meal},${p.calories ?? null},${p.values_source},${action.source})`;
      resultIds.push(rowId);
    } else {
      const original = { ...(raw as WorkoutPayload) };
      delete (original as Partial<WorkoutPayload>).date;
      const p = await resolveWorkout(
        original,
        user,
        tx as unknown as ReturnType<typeof db>,
      );
      confirmedPayload = p;
      for (const set of p.sets) {
        const rowId = randomUUID();
        await tx`INSERT INTO firstrep_workout_entries(id,user_id,date,exercise,exercise_id,sets,reps,weight_kg,rpe,notes,performed_at,source,weight_as_entered,weight_unit) VALUES(${rowId},${user.id},${p.date},${p.exercise_name},${p.exercise_id ?? null},1,${set.reps},${(set.weight ?? 0) * (set.unit === "lb" ? 0.45359237 : 1)},${set.rpe ?? null},${p.notes},${p.performed_at!},${action.source},${set.weight ?? null},${set.unit!})`;
        resultIds.push(rowId);
      }
    }
    await tx`UPDATE pending_log_actions SET status='confirmed',confirmed_at=NOW(),result_ids=${resultIds},payload=${JSON.stringify(confirmedPayload)}::jsonb WHERE id=${id}`;
    return { status: "confirmed", kind: action.kind, resultIds };
  });
}
export const actionRequest = z
  .object({
    conversationId: z.string().uuid(),
    payload: z.unknown().optional(),
  })
  .strict();
export function repeatPayload(
  kind: string,
  payload: FoodPayload | WorkoutPayload,
) {
  if (kind === "food") {
    const copy = { ...(payload as FoodPayload) };
    delete copy.log_date;
    return copy;
  }
  const copy = { ...(payload as WorkoutPayload) };
  delete (copy as Partial<WorkoutPayload>).date;
  delete copy.performed_at;
  return { ...copy, sets: [copy.sets.at(-1)!] };
}
