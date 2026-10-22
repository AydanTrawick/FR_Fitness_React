import test from "node:test";
import assert from "node:assert/strict";
import { achievementCatalog } from "../lib/achievements/catalog.ts";
import { evaluateAchievements, goalValue } from "../lib/achievements/model.ts";
import { activitySchema, activityFacts } from "../lib/achievements/activity.ts";
const input = (facts = [], extra = {}) => ({
  facts,
  today: "2026-10-22",
  ...extra,
});
const fact = (date, values, session = date, muscles = []) => ({
  date,
  values,
  session,
  muscles,
});
test("all 50 supplied quests and badges have unique IDs and the exact XP budget", () => {
  assert.equal(achievementCatalog.quests.length, 50);
  assert.equal(achievementCatalog.badges.length, 50);
  assert.equal(
    new Set(
      [...achievementCatalog.quests, ...achievementCatalog.badges].map(
        (a) => a.id,
      ),
    ).size,
    100,
  );
  assert.equal(
    achievementCatalog.quests.reduce((n, q) => n + q.xp, 0),
    3445,
  );
  const empty = evaluateAchievements(input());
  assert.equal(empty.quests.filter((q) => q.complete).length, 0);
  assert.equal(empty.badges.filter((b) => b.earned).length, 0);
});
test("each catalog metric evaluates, including lower-is-better and derived quest badges", () => {
  const values = {};
  for (const q of achievementCatalog.quests)
    values[q.goal.metric] = q.goal.metric.endsWith("_max") ? 1 : 1000000;
  Object.assign(values, {
    active: 1,
    water_goal_days: 1,
    macro_goal_days: 1,
    plan_observed: 1,
    planned_workouts: 1,
    planned_completed: 1,
    lifting_sessions: 4,
    running_sessions: 3,
  });
  const facts = Array.from({ length: 110 }, (_, i) =>
    fact(
      new Date(Date.UTC(2026, 6, i + 1)).toISOString().slice(0, 10),
      values,
      String(i),
      ["chest", "back", "arms", "legs", "core"],
    ),
  );
  const totals = {
    exercises_favorited: 10,
    ai_plans_generated: 1,
    workouts_saved: 1,
    big3_total_lbs: 1000,
    training_xp: 5000,
  };
  const state = evaluateAchievements(input(facts, { totals }));
  assert.deepEqual(
    state.quests.filter((q) => !q.complete).map((q) => q.title),
    [],
  );
  assert.equal(state.questXP, 3445);
  assert.ok(state.badges.find((b) => b.name === "Questmaster").earned);
  assert.ok(state.badges.find((b) => b.name === "XP Titan").earned);
});
test("calendar weeks, day windows and distinct session grouping do not blend unrelated periods", () => {
  const history = input([
    fact("2026-10-18", { workouts_logged: 1 }),
    fact("2026-10-19", { workouts_logged: 1 }),
  ]);
  assert.equal(
    goalValue(history, {
      metric: "workouts_logged",
      target: 2,
      window: "week",
    }),
    1,
  );
  assert.equal(
    goalValue(history, { metric: "workouts_logged", target: 2, window: "14d" }),
    2,
  );
  assert.equal(
    goalValue(history, { metric: "workouts_logged", target: 2, window: "day" }),
    1,
  );
});
test("streaks use distinct consecutive days, ignore future data, and retain earned awards", () => {
  const history = input([
    fact("2026-10-20", { active: 1 }),
    fact("2026-10-20", { active: 1 }, "second"),
    fact("2026-10-22", { active: 1 }),
    fact("2026-10-23", { active: 1 }),
  ]);
  assert.equal(
    goalValue(history, {
      metric: "activity_streak_days",
      target: 3,
      window: "streak",
    }),
    1,
  );
  const state = evaluateAchievements(
    input([], { earned: ["quest_01", "badge_01"] }),
  );
  assert.ok(state.quests[0].complete);
  assert.ok(state.badges[0].earned);
  assert.equal(state.questXP, 5);
});
test("time goals require evidence and accept equality without granting missing times", () => {
  const state = evaluateAchievements(
    input([fact("2026-10-22", { mile_time_sec_max: 600 })]),
  );
  assert.ok(state.quests.find((q) => q.id === "quest_16").complete);
  assert.equal(state.quests.find((q) => q.id === "quest_35").complete, false);
  assert.equal(state.badges.find((b) => b.id === "badge_21").earned, false);
});
test("activity validation and hydration aggregate real logs and complete mile splits", () => {
  assert.equal(
    activitySchema.safeParse({
      kind: "run",
      date: "2026-10-22",
      miles: 1,
      seconds: 700,
      fiveKSeconds: 600,
    }).success,
    false,
  );
  assert.equal(
    activitySchema.safeParse({
      kind: "run",
      date: "2026-10-22",
      miles: 2,
      seconds: 700,
      splits: [500, 500],
    }).success,
    false,
  );
  const activities = [
    {
      kind: "run",
      date: "2026-10-22",
      miles: 2,
      seconds: 1100,
      splits: [540, 550],
    },
    ...Array.from({ length: 3 }, () => ({
      kind: "water",
      date: "2026-10-22",
      ounces: 24,
      goalOunces: 64,
    })),
  ].map((a, i) => ({ ...activitySchema.parse(a), id: String(i) }));
  const facts = activityFacts(activities);
  const state = evaluateAchievements(input(facts));
  assert.ok(state.quests.find((q) => q.id === "quest_02").complete);
  assert.ok(state.quests.find((q) => q.id === "quest_28").complete);
  assert.equal(
    goalValue(input(facts), {
      metric: "water_goal_streak",
      target: 7,
      window: "streak",
    }),
    1,
  );
});
test("adherence requires full window coverage and an actual scheduled workout", () => {
  const facts = Array.from({ length: 14 }, (_, i) =>
    fact(`2026-10-${String(i + 1).padStart(2, "0")}`, {
      plan_observed: 1,
      planned_workouts: i % 2,
      planned_completed: i % 2,
    }),
  );
  const goal = { metric: "plan_adherence_pct", target: 100, window: "14d" };
  assert.equal(goalValue(input(facts.slice(0, 13)), goal), null);
  assert.equal(goalValue(input(facts), goal), 100);
  assert.equal(
    goalValue(
      input(facts.map((f) => ({ ...f, values: { plan_observed: 1 } }))),
      goal,
    ),
    null,
  );
});
