import type { Entry } from "./tracking";

export type CardUnit = "kg" | "lb";
export type CardSet = {
  number: number;
  count: number;
  reps: number;
  weightKg: number;
};
export type CardExercise = { name: string; sets: CardSet[] };
export type WorkoutCardData = {
  date: string;
  exercises: CardExercise[];
  totalSets: number;
  volumeKg: number;
};
export type PRCardData = {
  date: string;
  exercise: string;
  reps: number;
  weight: number;
  unit: CardUnit;
  previous?: number;
  bodyweight?: boolean;
};

export const cardWeight = (kg: number, unit: CardUnit) =>
  unit === "lb" ? kg / 0.45359237 : kg;
export const cardNumber = (value: number, maximumFractionDigits = 2) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
export function cardDate(date: string, withYear = false) {
  return new Date(date + "T12:00:00Z")
    .toLocaleDateString("en-US", {
      ...(withYear
        ? { year: "numeric" as const }
        : { weekday: "short" as const }),
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })
    .replaceAll(",", "")
    .toUpperCase();
}

// Legacy entries can contain several identical sets. Keep their range explicit,
// while newer per-set entries retain every individual weight and rep count.
export function workoutCardData(rows: Entry[], date: string): WorkoutCardData {
  const groups = new Map<string, CardExercise>();
  let totalSets = 0,
    volumeKg = 0;
  const selected = rows
    .filter((row) => row.date === date)
    .toSorted((a, b) =>
      String(a.performed_at || "").localeCompare(String(b.performed_at || "")),
    );
  for (const row of selected) {
    const count = Number(row.sets),
      reps = Number(row.reps),
      weightKg = Number(row.weight_kg);
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      !Number.isInteger(reps) ||
      reps < 1 ||
      !Number.isFinite(weightKg) ||
      weightKg < 0
    )
      continue;
    const name = String(row.exercise);
    const key = String(row.exercise_id || name.trim().toLowerCase());
    const exercise = groups.get(key) || { name, sets: [] };
    const number = exercise.sets.reduce((sum, set) => sum + set.count, 0) + 1;
    exercise.sets.push({ number, count, reps, weightKg });
    groups.set(key, exercise);
    totalSets += count;
    volumeKg += count * reps * weightKg;
  }
  return { date, exercises: [...groups.values()], totalSets, volumeKg };
}

export function validPR(data: PRCardData) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(data.date) &&
    Number.isFinite(Date.parse(data.date + "T12:00:00Z")) &&
    data.exercise.trim().length > 0 &&
    data.exercise.trim().length <= 100 &&
    Number.isInteger(data.reps) &&
    data.reps >= 1 &&
    data.reps <= 1000 &&
    Number.isFinite(data.weight) &&
    (data.weight > 0 || (data.weight === 0 && data.bodyweight === true)) &&
    data.weight <= (data.unit === "lb" ? 1000 / 0.45359237 : 1000) &&
    (data.previous === undefined ||
      (Number.isFinite(data.previous) &&
        data.previous >= 0 &&
        data.previous < data.weight))
  );
}

export const workoutCardStyles = [
  { id: "log", name: "Workout log", description: "Every set, at a glance" },
  { id: "volume", name: "Volume Split", description: "Where the work went" },
  { id: "ladder", name: "Set Ladder", description: "Your weights, set by set" },
  {
    id: "receipt",
    name: "Gym Receipt",
    description: "An itemized session receipt",
  },
  {
    id: "facts",
    name: "Workout Facts",
    description: "Your session, by the numbers",
  },
] as const;
export type WorkoutCardStyle = (typeof workoutCardStyles)[number]["id"];
export function exerciseCardStats(exercise: CardExercise) {
  const sets = exercise.sets;
  const first = sets[0]?.weightKg ?? 0;
  const last = sets.at(-1)?.weightKg ?? 0;
  const jump =
    first > 0 && last > first + 1e-8 ? ((last - first) / first) * 100 : null;
  const top = sets.reduce<CardSet | null>(
    (best, set) =>
      !best ||
      set.weightKg > best.weightKg ||
      (set.weightKg === best.weightKg && set.reps > best.reps)
        ? set
        : best,
    null,
  );
  return {
    exercise,
    count: sets.reduce((sum, s) => sum + s.count, 0),
    volumeKg: sets.reduce((sum, s) => sum + s.weightKg * s.reps * s.count, 0),
    first,
    last,
    jump,
    top,
  };
}
// Compare first and final recorded working weights within this session only.
// A zero starting load has no meaningful percentage increase.
export function biggestCardJump(exercises: CardExercise[]) {
  return (
    exercises
      .map(exerciseCardStats)
      .filter((s) => s.jump !== null)
      .sort((a, b) => b.jump! - a.jump!)[0] ?? null
  );
}
