import { z } from "zod";
import type { Fact } from "./model.ts";
const positive = z.number().finite().positive();
export const activitySchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("run"),
      date: z.string().date(),
      miles: positive.max(200),
      seconds: positive.max(604800),
      elevation: z.number().min(0).max(100000).default(0),
      splits: z.array(positive.max(86400)).max(200).default([]),
      mileSeconds: positive.max(86400).optional(),
      fiveKSeconds: positive.max(86400).optional(),
      tenKSeconds: positive.max(172800).optional(),
    })
    .superRefine((r, ctx) => {
      if (
        r.splits.length > Math.floor(r.miles) ||
        r.splits.reduce((n, v) => n + v, 0) > r.seconds
      )
        ctx.addIssue({
          code: "custom",
          message: "Mile splits must fit the distance and total duration.",
        });
      for (const [distance, time] of [
        [1, r.mileSeconds],
        [3.1, r.fiveKSeconds],
        [6.2, r.tenKSeconds],
      ])
        if (time !== undefined && (r.miles < distance! || time > r.seconds))
          ctx.addIssue({
            code: "custom",
            message: "Checkpoint times must fit the run distance and duration.",
          });
    }),
  z.object({
    kind: z.literal("water"),
    date: z.string().date(),
    ounces: positive.max(1000),
    goalOunces: positive.max(1000),
  }),
  z.object({
    kind: z.literal("mobility"),
    date: z.string().date(),
    minutes: positive.max(1440),
  }),
  z.object({
    kind: z.literal("nutrition"),
    date: z.string().date(),
    proteinTarget: positive.max(1000),
    calorieTarget: positive.max(20000),
  }),
  z
    .object({
      kind: z.literal("schedule"),
      date: z.string().date(),
      planned: z.number().int().min(0).max(10),
      completed: z.number().int().min(0).max(10),
    })
    .refine(
      (v) => v.completed <= v.planned,
      "Completed workouts cannot exceed planned workouts.",
    ),
]);
export type AchievementActivity = z.infer<typeof activitySchema> & {
  id: string;
};
export function activityFacts(activities: AchievementActivity[]): Fact[] {
  const facts: Fact[] = [];
  const water = new Map<
    string,
    { ounces: number; goal: number; logs: number }
  >();
  for (const a of activities) {
    const values: Record<string, number> = {};
    if (a.kind === "run") {
      Object.assign(values, {
        workouts_logged: 1,
        active: 1,
        running_sessions: 1,
        run_distance_mi: a.miles,
        elevation_gain_ft: a.elevation,
      });
      if (a.mileSeconds) values.mile_time_sec_max = a.mileSeconds;
      if (a.fiveKSeconds) values["5k_time_sec_max"] = a.fiveKSeconds;
      if (a.tenKSeconds) values["10k_time_sec_max"] = a.tenKSeconds;
      if (a.splits.length)
        values.mile_time_sec_max = Math.min(
          values.mile_time_sec_max ?? Infinity,
          ...a.splits,
        );
      if (
        a.splits.length >= 2 &&
        Math.max(...a.splits) - Math.min(...a.splits) <= 15
      )
        values.even_split_run_mi = a.splits.length;
    } else if (a.kind === "mobility")
      Object.assign(values, {
        mobility_minutes: a.minutes,
        mobility_sessions: 1,
        active: 1,
        workouts_logged: 1,
      });
    else if (a.kind === "water") {
      const current = water.get(a.date) ?? {
        ounces: 0,
        goal: a.goalOunces,
        logs: 0,
      };
      water.set(a.date, {
        ounces: current.ounces + a.ounces,
        goal: a.goalOunces,
        logs: current.logs + 1,
      });
    } else if (a.kind === "schedule")
      Object.assign(values, {
        plan_observed: 1,
        planned_workouts: a.planned,
        planned_completed: a.completed,
      });
    facts.push({ date: a.date, session: a.id, values });
  }
  for (const [date, w] of water)
    facts.push({
      date,
      values: {
        water_logs: w.logs,
        water_goal_days: Number(w.ounces >= w.goal),
      },
    });
  return facts;
}
