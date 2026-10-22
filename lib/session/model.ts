import { z } from "zod";
import { targetMuscles } from "../exercise-taxonomy.ts";
import {
  SESSION,
  GROUPS,
  SPLIT_GROUPS,
  type MuscleGroup,
  type Split,
} from "./config.ts";
import type { CatalogLift } from "../workout-session.ts";
export function groupFor(raw: string | null | undefined): MuscleGroup {
  const s = (raw ?? "").toLowerCase();
  if (/chest|pectoral/.test(s)) return "Chest";
  if (/lat|back|trap/.test(s)) return "Back";
  if (/shoulder|delt/.test(s)) return "Shoulders";
  if (/bicep|tricep|forearm/.test(s)) return "Arms";
  if (/abdominal|oblique|abs|core/.test(s)) return "Core";
  if (/glute/.test(s)) return "Glutes";
  if (/quad|hamstring|calf|calves|adductor|abductor|leg/.test(s)) return "Legs";
  return "Full body";
}
export function liftGroups(e: CatalogLift) {
  const primary = groupFor(e.primary_muscle ?? e.primary_muscles?.[0]);
  const secondary = [
    ...new Set((e.secondary_muscles ?? []).map(groupFor)),
  ].filter((g) => g !== primary);
  return { primary, secondary, all: [primary, ...secondary] };
}
export function matchesGroup(e: CatalogLift, group: string) {
  const { all } = liftGroups(e);
  return (
    !group ||
    group === "All" ||
    (group === "Full body"
      ? all.length >= 3 || all.includes("Full body")
      : all.includes(group as MuscleGroup))
  );
}
export const repBased = (e: CatalogLift) =>
  !e.metadata?.timed && !["cardio", "stretching"].includes(e.category ?? "");
export const draftExerciseSchema = z
  .object({
    exerciseId: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(300),
    muscleGroup: z.enum(GROUPS),
    secondaryGroups: z.array(z.enum(GROUPS)).max(8),
    equipment: z.string().max(100),
    targetSets: z.number().int().min(1).max(SESSION.maxSets),
    repMin: z.number().int().min(1).max(SESSION.maxReps),
    repMax: z.number().int().min(1).max(SESSION.maxReps),
    restOverrideSec: z.number().int().min(0).max(SESSION.maxRest).nullable(),
    supersetGroup: z
      .string()
      .regex(/^[A-Z]$/)
      .nullable(),
    custom: z.boolean().optional(),
    targetMuscle: z.string().max(40).optional(),
    movementPattern: z
      .enum(["push", "pull", "hinge", "squat", "carry", "core"])
      .optional(),
    weightKg: z.number().min(0).max(1000).default(0),
  })
  .refine((e) => !e.custom || targetMuscles.some((m) => m === e.targetMuscle), {
    message: "Choose a target muscle for custom exercises.",
  })
  .refine((e) => e.repMin <= e.repMax, {
    message: "Minimum reps must not exceed maximum reps.",
  });
export const draftSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    defaultRestSec: z.union([
      z.literal(60),
      z.literal(90),
      z.literal(120),
      z.literal(180),
    ]),
    split: z.enum(["push", "pull", "legs", "core", "full", "custom"]),
    source: z.enum(["recommended", "saved", "repeat", "scratch"]),
    savedWorkoutId: z.uuid().nullable(),
    exercises: z.array(draftExerciseSchema).max(SESSION.maxLifts),
    updatedAt: z.number().finite(),
  })
  .refine(
    (d) =>
      new Set(d.exercises.map((e) => e.exerciseId)).size === d.exercises.length,
    { message: "Each exercise can only appear once." },
  );
export const storedDraftSchema = draftSchema.safeExtend({
  name: z.string().max(120),
});
export type DraftExercise = z.infer<typeof draftExerciseSchema>;
export type SessionDraft = z.infer<typeof draftSchema>;
export type Performance = {
  sets: number;
  repMin: number;
  repMax: number;
  commonReps: number;
  weightKg: number;
  at: string;
};
export function emptyDraft(): SessionDraft {
  return {
    name: "My workout",
    defaultRestSec: SESSION.defaultRest,
    split: "custom",
    source: "scratch",
    savedWorkoutId: null,
    exercises: [],
    updatedAt: Date.now(),
  };
}
export function makeExercise(
  e: CatalogLift,
  last?: Performance,
): DraftExercise {
  const { primary, secondary, all } = liftGroups(e);
  const compound =
    all.length >= 2 &&
    ["barbell", "dumbbell", "machine"].includes(
      e.equipment?.toLowerCase() ?? "",
    );
  const defaults = compound
    ? SESSION.smartDefaults.compound
    : primary === "Core"
      ? SESSION.smartDefaults.core
      : SESSION.smartDefaults.isolation;
  return {
    exerciseId: e.id,
    name: e.name,
    muscleGroup: primary,
    secondaryGroups: secondary,
    equipment: e.equipment ?? "body only",
    targetSets: SESSION.defaultSets,
    repMin: last ? Math.min(SESSION.maxReps, last.repMin) : defaults.min,
    repMax: last ? Math.min(SESSION.maxReps, last.repMax) : defaults.max,
    restOverrideSec: defaults.rest,
    supersetGroup: null,
    weightKg: last?.weightKg ?? 0,
  };
}
export type Action =
  | { type: "LOAD_PLAN"; plan: SessionDraft }
  | { type: "ADD" | "TOGGLE"; exercise: DraftExercise; at?: number }
  | { type: "REMOVE" | "UNLINK"; id: string }
  | { type: "MOVE"; from: number; to: number }
  | {
      type: "SET_TARGET";
      id: string;
      sets?: number;
      repMin?: number;
      repMax?: number;
    }
  | { type: "SET_REST"; id: string; sec: number | null }
  | { type: "LINK_SUPERSET"; ids: string[] }
  | {
      type: "SET_META";
      name?: string;
      defaultRestSec?: SessionDraft["defaultRestSec"];
    }
  | { type: "RESET" };
export function normalizeSupersets(exercises: DraftExercise[]) {
  const result = exercises.map((e) => ({ ...e }));
  for (const group of new Set(
    result.map((e) => e.supersetGroup).filter(Boolean),
  )) {
    const indices = result.flatMap((e, i) =>
      e.supersetGroup === group ? [i] : [],
    );
    const runs: number[][] = [];
    for (const i of indices) {
      const last = runs.at(-1);
      if (last && last.at(-1) === i - 1) last.push(i);
      else runs.push([i]);
    }
    const keep = runs.find((run) => run.length >= 2 && run.length <= 3) ?? [];
    for (const i of indices)
      if (!keep.includes(i)) result[i].supersetGroup = null;
  }
  return result;
}
export function draftReducer(
  state: SessionDraft,
  action: Action,
): SessionDraft {
  let exercises = state.exercises.map((e) => ({ ...e }));
  let next = { ...state };
  switch (action.type) {
    case "RESET":
      return emptyDraft();
    case "LOAD_PLAN":
      return {
        ...action.plan,
        exercises: normalizeSupersets(action.plan.exercises),
        updatedAt: action.plan.updatedAt,
      };
    case "SET_META":
      next = {
        ...next,
        ...(action.name !== undefined ? { name: action.name } : {}),
        ...(action.defaultRestSec
          ? { defaultRestSec: action.defaultRestSec }
          : {}),
      };
      break;
    case "ADD":
    case "TOGGLE": {
      const found = exercises.some(
        (e) => e.exerciseId === action.exercise.exerciseId,
      );
      if (found && action.type === "TOGGLE")
        exercises = exercises.filter(
          (e) => e.exerciseId !== action.exercise.exerciseId,
        );
      else if (!found && exercises.length < SESSION.maxLifts)
        exercises.splice(action.at ?? exercises.length, 0, action.exercise);
      break;
    }
    case "REMOVE":
      exercises = exercises.filter((e) => e.exerciseId !== action.id);
      break;
    case "MOVE":
      if (
        action.from >= 0 &&
        action.from < exercises.length &&
        action.to >= 0 &&
        action.to < exercises.length
      ) {
        const [e] = exercises.splice(action.from, 1);
        exercises.splice(action.to, 0, e);
      }
      break;
    case "UNLINK": {
      exercises = exercises.map((e) =>
        e.exerciseId === action.id ? { ...e, supersetGroup: null } : e,
      );
      break;
    }
    case "LINK_SUPERSET": {
      const indices = exercises.flatMap((e, i) =>
        action.ids.includes(e.exerciseId) ? [i] : [],
      );
      if (
        indices.length < 2 ||
        indices.length > 3 ||
        indices.some((v, i) => i > 0 && v !== indices[i - 1] + 1)
      )
        return state;
      const letter = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        .split("")
        .find((g) => !exercises.some((e) => e.supersetGroup === g))!;
      exercises = exercises.map((e, i) =>
        indices.includes(i) ? { ...e, supersetGroup: letter } : e,
      );
      break;
    }
    case "SET_TARGET":
      exercises = exercises.map((e) => {
        if (e.exerciseId !== action.id) return e;
        const clamp = (n: number, max: number) =>
          Math.max(1, Math.min(max, Math.round(Number.isFinite(n) ? n : 1)));
        const min = clamp(action.repMin ?? e.repMin, SESSION.maxReps),
          max = clamp(action.repMax ?? e.repMax, SESSION.maxReps);
        return {
          ...e,
          targetSets: clamp(action.sets ?? e.targetSets, SESSION.maxSets),
          repMin: action.repMax !== undefined ? Math.min(min, max) : min,
          repMax: action.repMax !== undefined ? max : Math.max(min, max),
        };
      });
      break;
    case "SET_REST":
      exercises = exercises.map((e) =>
        e.exerciseId === action.id
          ? {
              ...e,
              restOverrideSec:
                action.sec === null
                  ? null
                  : Math.max(0, Math.min(SESSION.maxRest, action.sec)),
            }
          : e,
      );
      break;
  }
  return {
    ...next,
    exercises: normalizeSupersets(exercises),
    updatedAt: Math.max(Date.now(), state.updatedAt + 1),
  };
}
export function stats(plan: SessionDraft) {
  let seconds = 0;
  const handled = new Set<string>();
  for (const e of plan.exercises) {
    if (e.supersetGroup) {
      if (handled.has(e.supersetGroup)) continue;
      handled.add(e.supersetGroup);
      const members = plan.exercises.filter(
        (x) => x.supersetGroup === e.supersetGroup,
      );
      const rounds = Math.max(...members.map((x) => x.targetSets));
      seconds +=
        rounds * members.length * SESSION.workSec +
        (rounds - 1) *
          Math.max(
            ...members.map((x) => x.restOverrideSec ?? plan.defaultRestSec),
          ) +
        members.length * SESSION.transitionSec;
    } else
      seconds +=
        e.targetSets * SESSION.workSec +
        (e.targetSets - 1) * (e.restOverrideSec ?? plan.defaultRestSec) +
        SESSION.transitionSec;
  }
  return {
    lifts: plan.exercises.length,
    sets: plan.exercises.reduce((n, e) => n + e.targetSets, 0),
    minutes: Math.round(seconds / 60),
  };
}
export function coverage(exercises: DraftExercise[]) {
  const values = Object.fromEntries(GROUPS.map((g) => [g, 0])) as Record<
    MuscleGroup,
    number
  >;
  for (const e of exercises) {
    values[e.muscleGroup] += e.targetSets;
    for (const g of new Set(e.secondaryGroups))
      if (g !== e.muscleGroup)
        values[g] += e.targetSets * SESSION.secondaryWeight;
  }
  return values;
}
export function classify(exercises: DraftExercise[]): Split {
  const c = coverage(exercises),
    sum = Object.values(c).reduce((a, b) => a + b, 0) || 1;
  if ((c.Legs + c.Glutes) / sum >= SESSION.classification.dominant)
    return "legs";
  if (c.Core / sum >= SESSION.classification.dominant) return "core";
  if (
    (c.Chest + c.Shoulders) / sum >= SESSION.classification.pushPull &&
    c.Back / sum < SESSION.classification.opposing
  )
    return "push";
  if (
    c.Back / sum >= SESSION.classification.pushPull &&
    (c.Chest + c.Shoulders) / sum < SESSION.classification.opposing
  )
    return "pull";
  if (
    Object.values(c).filter((n) => n / sum >= SESSION.classification.full)
      .length >= 3
  )
    return "full";
  return "custom";
}
export function flags(
  plan: SessionDraft,
  weekly: Partial<Record<MuscleGroup, number>> = {},
) {
  const c = coverage(plan.exercises);
  const result: { group: MuscleGroup; message: string }[] = [];
  for (const g of SPLIT_GROUPS[plan.split])
    if (!c[g])
      result.push({
        group: g,
        message: `No ${g.toLowerCase()} work yet for a ${plan.split} day.`,
      });
  if (
    c.Chest + c.Shoulders >= SESSION.imbalanceSets &&
    c.Back === 0 &&
    (weekly.Back ?? 0) < SESSION.weeklyMin
  )
    result.push({
      group: "Back",
      message: "Your session has no pulling work yet.",
    });
  for (const g of GROUPS)
    if ((weekly[g] ?? 0) + c[g] > SESSION.weeklyMax)
      result.push({
        group: g,
        message: `${g} hit ${(weekly[g] ?? 0) + c[g]} sets this week — consider fewer.`,
      });
  return result;
}
