import "server-only";
import { randomUUID } from "node:crypto";
import type { TransactionSql } from "postgres";
import { db, HttpError } from "../database";
import { sharedRateStorage } from "../auth/rate-storage";
import {
  checkinSchema,
  profileSchema,
  type Plan,
  type Goal,
  type ProgressState,
  type Card,
  type Checkin,
  type CoachMessage,
  type Playbook,
} from "./schema";
import {
  needsSupport,
  safeGoal,
  SUPPORT_MESSAGE,
  validatePlanSafety,
} from "./safety";
import { buildPlaybook } from "./model";

export async function coachLimit(userId: string, max = 30) {
  const result = await sharedRateStorage.consume("progress:" + userId, {
    window: 3600,
    max,
  });
  if (!result.allowed)
    throw new HttpError(
      "Coach request limit reached. Try again in an hour.",
      429,
    );
}
export async function acquireLease(userId: string) {
  const token = randomUUID();
  const rows =
    await db()`INSERT INTO progress_coach_leases(user_id,token,expires_at) VALUES (${userId},${token},NOW()+INTERVAL '5 minutes') ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE progress_coach_leases.expires_at<NOW() RETURNING token`;
  if (!rows.length)
    throw new HttpError(
      "Your coach is already handling a request. Wait for it to finish, then retry.",
      409,
    );
  return async () => {
    await db()`DELETE FROM progress_coach_leases WHERE user_id=${userId} AND token=${token}`;
  };
}
export async function profileAndWeight(userId: string) {
  const [profiles, weights] = await Promise.all([
    db()`SELECT * FROM user_body_profile WHERE user_id=${userId}`,
    db()`SELECT weight_kg FROM checkins WHERE user_id=${userId} ORDER BY created_at DESC,id DESC LIMIT 1`,
  ]);
  if (!profiles.length || !weights.length)
    throw new HttpError("Complete your baseline check-in first.");
  return {
    profile: profileSchema.parse(profiles[0]),
    weight: Number(weights[0].weight_kg),
  };
}
export async function requireNutritionAllowed(userId: string) {
  const profile = (
    await db()`SELECT nutrition_paused FROM user_body_profile WHERE user_id=${userId}`
  )[0];
  if (profile?.nutrition_paused) throw new HttpError(SUPPORT_MESSAGE, 422);
}
export async function latestPlaybook(userId: string) {
  const rows = await db()<
    Omit<Playbook, "items">[]
  >`SELECT p.id,p.goal_id,p.version,p.created_at,p.plan,g.structured AS goal FROM playbooks p JOIN goals g ON g.id=p.goal_id WHERE p.user_id=${userId} AND g.status='active' ORDER BY p.created_at DESC,p.version DESC LIMIT 1`;
  return rows[0] || null;
}
export function localDate(timezone = "America/New_York") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export async function progressState(
  userId: string,
  timezone?: string,
): Promise<ProgressState> {
  const sql = db();
  const [profiles, checkins, messages, playbook, adjustments] =
    await Promise.all([
      sql`SELECT * FROM user_body_profile WHERE user_id=${userId}`,
      sql<
        Checkin[]
      >`SELECT c.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'pose',p.pose) ORDER BY p.pose) FROM checkin_photos p WHERE p.checkin_id=c.id),'[]') AS photos FROM checkins c WHERE c.user_id=${userId} ORDER BY c.created_at DESC,c.id DESC LIMIT 200`,
      sql<
        CoachMessage[]
      >`SELECT id,role,content,created_at FROM (SELECT * FROM coach_messages WHERE user_id=${userId} ORDER BY created_at DESC,id DESC LIMIT 100) m ORDER BY created_at,id`,
      latestPlaybook(userId),
      sql<
        { id: string; reason: string; summary: string; status: string }[]
      >`SELECT a.id,a.reason,a.summary,a.status FROM adjustments a JOIN playbooks p ON p.id=a.playbook_id WHERE p.user_id=${userId} AND a.status='pending' ORDER BY a.created_at DESC`,
    ]);
  // Reconcile persisted cards with their current approval state on every reload.
  const goalRows =
    await sql`SELECT id,status FROM goals WHERE user_id=${userId}`;
  const adjustmentRows =
    await sql`SELECT a.id,a.status FROM adjustments a JOIN playbooks p ON p.id=a.playbook_id WHERE p.user_id=${userId}`;
  const statuses = new Map(
    [...goalRows, ...adjustmentRows].map((r) => [r.id, r.status]),
  );
  const cleanMessages = messages.map((m) => ({
    ...m,
    content: {
      ...m.content,
      cards: m.content.cards?.map((c: Card) => ({
        ...c,
        status: statuses.get(c.id) || "archived",
      })),
    },
  }));
  const items = playbook
    ? await sql<
        Playbook["items"]
      >`SELECT i.id,i.type,i.sort_order,COALESCE(l.done,false) AS done FROM playbook_items i LEFT JOIN habit_logs l ON l.playbook_item_id=i.id AND l.date=${localDate(timezone)} WHERE i.playbook_id=${playbook.id} ORDER BY i.sort_order`
    : [];
  return {
    profile: profiles.length ? profileSchema.parse(profiles[0]) : null,
    checkins,
    messages: cleanMessages,
    playbook: playbook ? { ...playbook, items } : null,
    adjustments: adjustments.map((a) => ({
      kind: "adjustment" as const,
      ...a,
    })),
    photoConsent: !!profiles[0]?.photo_consent_at,
    capabilities: {
      coach: !!process.env.ANTHROPIC_API_KEY,
      photos:
        !!process.env.PROGRESS_R2_BUCKET_NAME &&
        !!process.env.PROGRESS_R2_API_TOKEN &&
        !!process.env.R2_ACCOUNT_ID &&
        !!process.env.R2_ACCESS_KEY_ID &&
        !!process.env.R2_SECRET_ACCESS_KEY &&
        !!process.env.ANTHROPIC_API_KEY,
    },
  };
}
// Drizzle auth changes the shared Postgres JSON serializers. Explicit text casts
// keep raw SQL writes independent of whether auth has initialized that pool.
export async function saveCheckin(userId: string, input: unknown) {
  const { profile, ...c } = checkinSchema.parse(input);
  const sql = db();
  await sql.begin(async (tx) => {
    await tx`SELECT id FROM "user" WHERE id=${userId} AND deleted_at IS NULL FOR UPDATE`;
    const existing = await tx`SELECT id FROM checkins WHERE id=${c.id}`;
    if (existing.length)
      throw new HttpError(
        "This check-in was already saved. Reload your progress.",
        409,
      );
    await tx`INSERT INTO user_body_profile(user_id,height_cm,sex,birth_year,experience,equipment,days_per_week,diet_restrictions,units_pref,hide_bodyfat) VALUES (${userId},${profile.height_cm},${profile.sex},${profile.birth_year},${profile.experience},${JSON.stringify(profile.equipment)}::text::jsonb,${profile.days_per_week},${JSON.stringify(profile.diet_restrictions)}::text::jsonb,${profile.units_pref},${profile.hide_bodyfat}) ON CONFLICT(user_id) DO UPDATE SET height_cm=excluded.height_cm,sex=excluded.sex,birth_year=excluded.birth_year,experience=excluded.experience,equipment=excluded.equipment,days_per_week=excluded.days_per_week,diet_restrictions=excluded.diet_restrictions,units_pref=excluded.units_pref,hide_bodyfat=excluded.hide_bodyfat`;
    await tx`INSERT INTO checkins(id,user_id,weight_kg,energy,soreness,adherence,notes) VALUES (${c.id},${userId},${c.weight_kg},${c.energy},${c.soreness},${c.adherence},${c.notes})`;
    if (needsSupport(c.notes))
      await tx`UPDATE user_body_profile SET nutrition_paused=true WHERE user_id=${userId}`;
  });
  return c.id;
}
export async function saveMessage(
  userId: string,
  role: string,
  text: string,
  cards: Card[] = [],
) {
  const sql = db();
  return (
    await sql`INSERT INTO coach_messages(user_id,role,content) VALUES (${userId},${role},${JSON.stringify({ text, cards })}::text::jsonb) RETURNING id,role,content,created_at`
  )[0];
}
export async function draftGoal(
  userId: string,
  input: unknown,
  prompt: string,
) {
  await requireNutritionAllowed(userId);
  if (await latestPlaybook(userId))
    throw new HttpError(
      "A Playbook exists. Propose an adjustment instead of replacing the confirmed goal.",
    );
  const { profile, weight } = await profileAndWeight(userId);
  const goal = safeGoal(input, profile, weight);
  const sql = db();
  const rows =
    await sql`INSERT INTO goals(user_id,type,focus_areas,target_weight_kg,target_date,raw_prompt,structured) VALUES (${userId},${goal.type},${goal.focus_areas},${goal.target_weight_kg},${goal.target_date},${prompt},${JSON.stringify(goal)}::text::jsonb) RETURNING id`;
  return { kind: "goal" as const, id: rows[0].id, goal, status: "draft" };
}
async function catalog() {
  const rows =
    await db()`SELECT id,name,primary_muscle,equipment,level FROM exercises WHERE category='strength' OR source='firstrep' ORDER BY (source='firstrep') DESC,id LIMIT 400`;
  if (!rows.length)
    throw new HttpError(
      "The exercise library needs to be seeded before building a Playbook.",
      503,
    );
  return rows;
}
type Transaction = TransactionSql;
async function insertPlaybook(
  tx: Transaction,
  userId: string,
  goalId: string,
  version: number,
  plan: Plan,
  previousBookId?: string,
) {
  const book = (
    await tx`INSERT INTO playbooks(user_id,goal_id,version,plan) VALUES (${userId},${goalId},${version},${JSON.stringify(plan)}::text::jsonb) RETURNING id`
  )[0];
  const entries = [
    ...plan.training.map((w) => ({
      type: "workout",
      content: w,
      exercise_ids: w.exercises.map((e) => e.exerciseId),
    })),
    { type: "meal_plan", content: plan.nutrition, exercise_ids: [] },
    ...plan.habits.map((h) => ({
      type: "habit",
      content: h,
      exercise_ids: [],
    })),
    ...plan.tips.map((t) => ({ type: "tip", content: t, exercise_ids: [] })),
  ];
  for (const [order, entry] of entries.entries()) {
    const item = (
      await tx`INSERT INTO playbook_items(playbook_id,type,content,exercise_ids,sort_order) VALUES (${book.id},${entry.type},${JSON.stringify(entry.content)}::text::jsonb,${entry.exercise_ids},${order}) RETURNING id`
    )[0];
    if (entry.type === "habit" && previousBookId)
      await tx`INSERT INTO habit_logs(playbook_item_id,date,done) SELECT ${item.id},l.date,bool_or(l.done) FROM habit_logs l JOIN playbook_items i ON i.id=l.playbook_item_id WHERE i.playbook_id=${previousBookId} AND i.type='habit' AND i.content=${JSON.stringify(entry.content)}::text::jsonb GROUP BY l.date ON CONFLICT(playbook_item_id,date) DO NOTHING`;
  }
  return book.id as string;
}
export async function confirmGoal(
  userId: string,
  id: string,
  signal?: AbortSignal,
) {
  await requireNutritionAllowed(userId);
  const sql = db();
  const row = (
    await sql`SELECT * FROM goals WHERE id=${id} AND user_id=${userId}`
  )[0];
  if (!row) throw new HttpError("Goal not found.", 404);
  if (row.status === "active") {
    const existing = await latestPlaybook(userId);
    if (existing?.goal_id === id) return existing.id;
  }
  if (row.status !== "draft")
    throw new HttpError("This Goal Card is no longer pending.", 409);
  const { profile, weight } = await profileAndWeight(userId);
  const goal = safeGoal(row.structured, profile, weight);
  goal.safety_notes = [
    ...new Set([...row.structured.safety_notes, ...goal.safety_notes]),
  ];
  goal.target_date = row.structured.target_date;
  if (Date.now() - new Date(row.created_at).getTime() > 86400000)
    throw new HttpError(
      "This Goal Card is over a day old. Ask the coach for a fresh card before confirming.",
      409,
    );
  // Changed measurements cannot silently change the card the user confirmed.
  if (
    goal.target_weight_kg !== row.structured.target_weight_kg ||
    goal.timeline_weeks !== row.structured.timeline_weeks
  )
    throw new HttpError(
      "Your baseline changed. Ask the coach for an updated Goal Card before confirming.",
      409,
    );
  const plan = await buildPlaybook(
    profile,
    weight,
    goal,
    await catalog(),
    undefined,
    signal,
  );
  return sql.begin(async (tx) => {
    await tx`SELECT id FROM "user" WHERE id=${userId} AND deleted_at IS NULL FOR UPDATE`;
    if (
      (
        await tx`SELECT id FROM goals WHERE user_id=${userId} AND status='active'`
      ).length
    )
      throw new HttpError("A Playbook was already created. Reload it.", 409);
    await tx`UPDATE goals SET status='archived' WHERE user_id=${userId} AND status='draft' AND id<>${id}`;
    await tx`UPDATE goals SET status='active',structured=${JSON.stringify(goal)}::text::jsonb WHERE id=${id} AND user_id=${userId}`;
    return insertPlaybook(tx, userId, id, 1, plan);
  });
}
export async function proposeAdjustment(
  userId: string,
  request: string,
  reason: string,
  signal?: AbortSignal,
): Promise<Card> {
  await requireNutritionAllowed(userId);
  const book = await latestPlaybook(userId);
  if (!book)
    throw new HttpError("Confirm a Goal Card to create your first Playbook.");
  const { profile, weight } = await profileAndWeight(userId);
  const plan = await buildPlaybook(
    profile,
    weight,
    book.goal as Goal,
    await catalog(),
    { current: book.plan as Plan, request },
    signal,
  );
  const sql = db();
  const row = (
    await sql`INSERT INTO adjustments(playbook_id,proposed,reason,summary) VALUES (${book.id},${JSON.stringify(plan)}::text::jsonb,${reason},${request}) RETURNING id`
  )[0];
  return {
    kind: "adjustment",
    id: row.id,
    reason,
    summary: request,
    status: "pending",
  };
}
export async function reviewAdjustment(
  userId: string,
  id: string,
  accepted: boolean,
) {
  if (accepted) await requireNutritionAllowed(userId);
  const sql = db();
  return sql.begin(async (tx) => {
    await tx`SELECT id FROM "user" WHERE id=${userId} AND deleted_at IS NULL FOR UPDATE`;
    const a = (
      await tx`SELECT a.*,p.goal_id,p.version,p.user_id FROM adjustments a JOIN playbooks p ON p.id=a.playbook_id WHERE a.id=${id} AND p.user_id=${userId} FOR UPDATE OF a`
    )[0];
    if (!a) throw new HttpError("Adjustment not found.", 404);
    if (a.status !== "pending")
      throw new HttpError("This adjustment has already been reviewed.", 409);
    if (accepted) {
      const latest = (
        await tx`SELECT id FROM playbooks WHERE user_id=${userId} AND goal_id=${a.goal_id} ORDER BY version DESC LIMIT 1`
      )[0];
      if (latest.id !== a.playbook_id)
        throw new HttpError(
          "Your Playbook changed. Ask for a fresh proposal.",
          409,
        );
      const profile = profileSchema.parse(
        (await tx`SELECT * FROM user_body_profile WHERE user_id=${userId}`)[0],
      );
      const weight = Number(
        (
          await tx`SELECT weight_kg FROM checkins WHERE user_id=${userId} ORDER BY created_at DESC LIMIT 1`
        )[0].weight_kg,
      );
      validatePlanSafety(a.proposed as Plan, profile, weight);
      await insertPlaybook(
        tx,
        userId,
        a.goal_id,
        a.version + 1,
        a.proposed as Plan,
        a.playbook_id,
      );
      await tx`UPDATE adjustments SET status='rejected' WHERE playbook_id=${a.playbook_id} AND status='pending' AND id<>${id}`;
    }
    await tx`UPDATE adjustments SET status=${accepted ? "accepted" : "rejected"} WHERE id=${id}`;
  });
}
