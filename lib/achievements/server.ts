import { db, type User } from "../server";
import { fetchRaw } from "../analysis/queries";
import { localDate } from "../analysis/metrics";
import { calories, type Entry } from "../tracking";
import { readSessionNote } from "../workout-session";
import { evaluateAchievements, type Fact } from "./model";
import { activityFacts, type AchievementActivity } from "./activity";

export async function achievementState(user: User, persist = false) {
  const sql = db(),
    timezone = user.timezone || "UTC";
  const today = localDate(new Date().toISOString(), timezone);
  const [raw, food, entries, savedActivities, awards, plans, nutritionPlans] =
    await Promise.all([
      fetchRaw(user.id),
      sql`SELECT * FROM firstrep_food_entries WHERE user_id=${user.id}`,
      sql`SELECT * FROM firstrep_workout_entries WHERE user_id=${user.id}`,
      sql`SELECT id,data FROM firstrep_achievement_activity WHERE user_id=${user.id} ORDER BY created_at,id`,
      sql`SELECT achievement_id FROM firstrep_achievement_awards WHERE user_id=${user.id}`,
      sql`SELECT (SELECT count(*) FROM playbooks WHERE user_id=${user.id} AND version=1) + (SELECT count(*) FROM firstrep_achievement_events WHERE user_id=${user.id}) AS count`,
      sql`SELECT created_at,plan->'nutrition' AS nutrition FROM playbooks WHERE user_id=${user.id} ORDER BY created_at`,
    ]);
  if (raw.errors.length)
    throw new Error("Achievement history is temporarily unavailable.");
  const activities = savedActivities.map(
    (row) => ({ ...row.data, id: row.id }) as AchievementActivity,
  );
  const facts: Fact[] = activityFacts(activities);
  const sessions = raw.sessions
    .filter(
      (s) =>
        s.completedAt &&
        (s.dateOnly ?? localDate(s.completedAt!, timezone)) <= today,
    )
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const records = new Map<string, number>();
  const big3 = { squat: 0, bench: 0, deadlift: 0 };
  let trainingSets = 0;
  for (const s of sessions) {
    const date = s.dateOnly ?? localDate(s.completedAt!, timezone);
    const sets = s.sets.filter((set) => !set.warmup && set.count > 0);
    if (!sets.length) continue;
    const values: Record<string, number> = {
      workouts_logged: 1,
      active: 1,
      lifting_sessions: 1,
      volume_lbs: 0,
      total_reps: 0,
      pushup_reps: 0,
      prs_set: 0,
    };
    const muscleGroups = [
      ...new Set(
        sets
          .flatMap((set) => set.primaryMuscles ?? [set.primary])
          .filter((m) => m && m !== "Unclassified"),
      ),
    ];
    values.lower_body_sessions = Number(
      muscleGroups.some((g) =>
        /quad|hamstring|glute|calf|calves|leg|adductor|abductor/i.test(g),
      ),
    );
    if (!s.legacy) {
      const hour = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          hour: "numeric",
          hourCycle: "h23",
        }).format(new Date(s.completedAt!)),
      );
      values.workouts_before_8am = Number(hour < 8);
      values.workouts_before_7am = Number(hour < 7);
      values.workouts_after_9pm = Number(hour >= 21);
    }
    values.weekend_workouts = Number(
      [0, 6].includes(new Date(date + "T12:00:00Z").getUTCDay()),
    );
    values.voice_logs = Number(
      entries.some(
        (r) =>
          r.source === "voice" &&
          (readSessionNote(r.notes)?.id === s.id ||
            (s.legacy && String(r.date).slice(0, 10) === date)),
      ),
    );
    const body = raw.body
      .filter((b) => localDate(b.date, timezone) <= date)
      .at(-1)?.weight;
    const sessionBests = new Map<string, number>();
    for (const set of sets) {
      trainingSets += set.count;
      const reps = set.reps ?? 0,
        pounds = (set.weight ?? 0) / 0.45359237;
      values.volume_lbs += pounds * reps * set.count;
      values.total_reps += reps * set.count;
      if (/push[ -]?up/i.test(set.name)) values.pushup_reps += reps * set.count;
      if (reps > 0 && pounds > 0) {
        const estimate = pounds * (1 + reps / 30);
        sessionBests.set(
          set.exerciseId,
          Math.max(sessionBests.get(set.exerciseId) ?? 0, estimate),
        );
        // Ratios require the actual lifted load, never an estimated max.
        for (const lift of ["squat", "bench", "deadlift"] as const) {
          const eligible =
            lift === "squat"
              ? /^(barbell )?(back )?squat$/i.test(set.name)
              : lift === "bench"
                ? /^(barbell )?bench press( - medium grip)?$/i.test(set.name)
                : /^(barbell )?deadlift$/i.test(set.name);
          if (!eligible) continue;
          if (body && body > 0)
            values[`${lift}_bw_ratio`] = Math.max(
              values[`${lift}_bw_ratio`] ?? 0,
              (set.weight ?? 0) / body,
            );
          if (reps === 1) big3[lift] = Math.max(big3[lift], pounds);
        }
      }
    }
    for (const [id, value] of sessionBests) {
      const previous = records.get(id);
      if (previous !== undefined && value > previous + 0.001) values.prs_set++;
      records.set(id, Math.max(previous ?? 0, value));
    }
    facts.push({ date, session: s.id, values, muscles: muscleGroups });
  }
  const mealsByDay = new Map<string, Entry[]>();
  for (const meal of food) {
    const date = String(meal.date).slice(0, 10);
    if (date <= today)
      mealsByDay.set(date, [...(mealsByDay.get(date) ?? []), meal as Entry]);
  }
  for (const [date, meals] of mealsByDay) {
    const dailyTargets = activities.find(
      (a) => a.kind === "nutrition" && a.date === date,
    );
    const planTargets = nutritionPlans
      .filter((p) => localDate(String(p.created_at), timezone) <= date)
      .at(-1)?.nutrition;
    const proteinTarget =
      dailyTargets?.kind === "nutrition"
        ? dailyTargets.proteinTarget
        : Number(planTargets?.protein_g ?? 0);
    const calorieTarget =
      dailyTargets?.kind === "nutrition"
        ? dailyTargets.calorieTarget
        : Number(planTargets?.calories ?? 0);
    const protein = meals.reduce((n, r) => n + Number(r.protein_g ?? 0), 0);
    const kcal = meals.reduce((n, r) => n + (calories(r) ?? 0), 0);
    const proteinHit = proteinTarget > 0 && protein >= proteinTarget;
    const calorieHit =
      calorieTarget > 0 &&
      meals.every((r) => calories(r) !== null) &&
      Math.abs(kcal - calorieTarget) <= calorieTarget * 0.05;
    // A meal label denotes one meal even when it contains multiple food entries.
    const mealCount = new Set(
      meals.map((r) => (r.meal && r.meal !== "unspecified" ? r.meal : r.id)),
    ).size;
    facts.push({
      date,
      values: {
        meals_logged: mealCount,
        meal_logged_days: 1,
        protein_goal_days: Number(proteinHit),
        macro_goal_days: Number(proteinHit && calorieHit),
      },
    });
  }
  const input = {
    facts,
    today,
    earned: awards.map((a) => String(a.achievement_id)),
    totals: {
      exercises_favorited: raw.library.filter((i) => i.kind === "exercise")
        .length,
      workouts_saved: raw.library.filter((i) => i.kind === "workout").length,
      ai_plans_generated: Number(plans[0].count),
      big3_total_lbs:
        big3.squat && big3.bench && big3.deadlift
          ? big3.squat + big3.bench + big3.deadlift
          : 0,
      training_xp: trainingSets * 10,
    },
  };
  const state = evaluateAchievements(input);
  if (persist) {
    const ids = [
      ...state.quests.filter((q) => q.complete).map((q) => q.id),
      ...state.badges.filter((b) => b.earned).map((b) => b.id),
    ];
    if (ids.length)
      await sql`INSERT INTO firstrep_achievement_awards ${sql(ids.map((achievement_id) => ({ user_id: user.id, achievement_id })))} ON CONFLICT DO NOTHING`;
  }
  return { ...state, activities };
}
