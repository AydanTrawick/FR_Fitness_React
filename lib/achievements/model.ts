import { achievementCatalog } from "./catalog.ts";
import { shiftDate } from "../dashboard.ts";

export type Fact = {
  date: string;
  session?: string;
  values: Record<string, number>;
  muscles?: string[];
};
export type AchievementInput = {
  facts: Fact[];
  totals?: Record<string, number>;
  earned?: string[];
  today: string;
};
export type Goal = { metric: string; target: number; window: string };
const dayNumber = (date: string) => Date.parse(date + "T12:00:00Z") / 86400000;
const monday = (date: string) =>
  shiftDate(date, -((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7));
const streak = (dates: string[]) => {
  let best = 0,
    count = 0,
    previous = -Infinity;
  for (const date of [...new Set(dates)].sort()) {
    const n = dayNumber(date);
    count = n === previous + 1 ? count + 1 : 1;
    previous = n;
    best = Math.max(best, count);
  }
  return best;
};
const aliases: Record<string, string> = {
  longest_run_mi: "run_distance_mi",
  lifetime_run_mi: "run_distance_mi",
  best_mile_sec_max: "mile_time_sec_max",
  lifetime_volume_lbs: "volume_lbs",
  lifetime_mobility_minutes: "mobility_minutes",
};
const maximumMetrics = new Set([
  "squat_bw_ratio",
  "bench_bw_ratio",
  "deadlift_bw_ratio",
  "elevation_gain_ft",
  "even_split_run_mi",
]);
const uniqueDays = new Set([
  "meal_logged_days",
  "protein_goal_days",
  "macro_goal_days",
]);
export function goalValue(input: AchievementInput, goal: Goal): number | null {
  const metric = aliases[goal.metric] ?? goal.metric;
  const facts = input.facts.filter((f) => f.date <= input.today);
  if (
    goal.metric === "activity_streak_days" ||
    goal.metric === "water_goal_streak" ||
    goal.metric === "macro_goal_streak"
  ) {
    const key =
      goal.metric === "activity_streak_days"
        ? "active"
        : goal.metric === "water_goal_streak"
          ? "water_goal_days"
          : "macro_goal_days";
    return streak(
      facts.filter((f) => (f.values[key] ?? 0) > 0).map((f) => f.date),
    );
  }
  if (goal.window === "total" && input.totals?.[goal.metric] !== undefined)
    return input.totals[goal.metric];
  const aggregate = (rows: Fact[]): number | null => {
    if (metric === "muscle_groups_trained")
      return new Set(rows.flatMap((r) => r.muscles ?? [])).size;
    if (metric === "hybrid_week") {
      const lifts = rows.reduce(
        (n, r) => n + (r.values.lifting_sessions ?? 0),
        0,
      );
      const runs = rows.reduce(
        (n, r) => n + (r.values.running_sessions ?? 0),
        0,
      );
      return Number(lifts >= 4 && runs >= 3);
    }
    if (metric === "plan_adherence_pct") {
      // Every day of the full window must be observed, including rest days.
      const coverage = new Set(
        rows.filter((r) => r.values.plan_observed === 1).map((r) => r.date),
      );
      const needed = goal.window === "14d" ? 14 : 30;
      if (coverage.size < needed) return null;
      const scheduled = rows.reduce(
        (n, r) => n + (r.values.planned_workouts ?? 0),
        0,
      );
      return scheduled > 0
        ? Math.min(
            100,
            (rows.reduce((n, r) => n + (r.values.planned_completed ?? 0), 0) /
              scheduled) *
              100,
          )
        : null;
    }
    const values = rows
      .map((r) => r.values[metric])
      .filter((v) => v !== undefined && Number.isFinite(v));
    if (metric.endsWith("_max"))
      return values.some((v) => v > 0)
        ? Math.min(...values.filter((v) => v > 0))
        : null;
    if (uniqueDays.has(metric))
      return new Set(
        rows.filter((r) => (r.values[metric] ?? 0) > 0).map((r) => r.date),
      ).size;
    if (maximumMetrics.has(metric) || goal.metric === "longest_run_mi")
      return values.length ? Math.max(...values) : null;
    return values.reduce((a, b) => a + b, 0);
  };
  if (goal.window === "total") return aggregate(facts);
  const groups = new Map<string, Fact[]>();
  if (goal.window === "14d" || goal.window === "30d") {
    const span = goal.window === "14d" ? 14 : 30;
    for (const end of new Set(facts.map((r) => r.date)))
      groups.set(
        end,
        facts.filter(
          (r) =>
            dayNumber(end) - dayNumber(r.date) >= 0 &&
            dayNumber(end) - dayNumber(r.date) < span,
        ),
      );
  } else
    for (const fact of facts) {
      const key =
        goal.window === "single"
          ? fact.session
          : goal.window === "week"
            ? monday(fact.date)
            : fact.date;
      if (key) groups.set(key, [...(groups.get(key) ?? []), fact]);
    }
  const values = [...groups.values()]
    .map(aggregate)
    .filter((v): v is number => v !== null);
  return values.length
    ? metric.endsWith("_max")
      ? Math.min(...values)
      : Math.max(...values)
    : null;
}
export function evaluateAchievements(input: AchievementInput) {
  const earned = new Set(input.earned ?? []);
  const quests = achievementCatalog.quests.map((q) => {
    const value = goalValue(input, q.goal);
    const complete =
      earned.has(q.id) ||
      (value !== null &&
        (q.goal.metric.endsWith("_max")
          ? value > 0 && value <= q.goal.target
          : value >= q.goal.target));
    return {
      ...q,
      value,
      complete,
      progress: complete
        ? q.goal.target
        : q.goal.metric.endsWith("_max")
          ? 0
          : Math.min(q.goal.target, value ?? 0),
    };
  });
  const questXP = quests
    .filter((q) => q.complete)
    .reduce((n, q) => n + q.xp, 0);
  const enriched = {
    ...input,
    totals: {
      ...input.totals,
      quests_completed: quests.filter((q) => q.complete).length,
      tier5_quests_completed: quests.filter((q) => q.complete && q.tier === 5)
        .length,
      total_xp: (input.totals?.training_xp ?? 0) + questXP,
    },
  };
  const badges = achievementCatalog.badges.map((b) => {
    const value = goalValue(enriched, {
      metric: b.criteria.metric,
      target: b.criteria.threshold,
      window: [
        "longest_run_mi",
        "best_mile_sec_max",
        "squat_bw_ratio",
        "bench_bw_ratio",
        "deadlift_bw_ratio",
      ].includes(b.criteria.metric)
        ? "single"
        : "total",
    });
    return {
      ...b,
      value,
      earned:
        earned.has(b.id) ||
        (value !== null &&
          (b.criteria.metric.endsWith("_max")
            ? value > 0 && value <= b.criteria.threshold
            : value >= b.criteria.threshold)),
    };
  });
  return { quests, badges, questXP, totalXP: enriched.totals.total_xp };
}
export type AchievementState = ReturnType<typeof evaluateAchievements>;
