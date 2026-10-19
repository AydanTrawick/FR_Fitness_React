export type MuscleRow = {
  name: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  sets: number;
};
export type MuscleTotals = Record<
  string,
  { sets: number; exercises: string[] }
>;

export function scoreMuscles(rows: MuscleRow[]): MuscleTotals {
  const totals: MuscleTotals = {};
  for (const row of rows) {
    const primary = new Set(
      row.primary_muscles.map((muscle) => muscle.toLowerCase().trim()),
    );
    const secondary = new Set(
      row.secondary_muscles.map((muscle) => muscle.toLowerCase().trim()),
    );
    for (const muscle of primary) {
      const total = (totals[muscle] ??= { sets: 0, exercises: [] });
      total.sets += Number(row.sets);
      if (!total.exercises.includes(row.name)) total.exercises.push(row.name);
    }
    for (const muscle of secondary) {
      if (primary.has(muscle)) continue;
      const total = (totals[muscle] ??= { sets: 0, exercises: [] });
      total.sets += Number(row.sets) * 0.5;
      if (!total.exercises.includes(row.name)) total.exercises.push(row.name);
    }
  }
  for (const total of Object.values(totals)) total.exercises.sort();
  return totals;
}

export const muscleSlugs = {
  abdominals: ["abs", "obliques"],
  abductors: ["abductors"],
  adductors: ["adductor"],
  biceps: ["biceps"],
  calves: ["calves"],
  chest: ["chest"],
  forearms: ["forearm"],
  glutes: ["gluteal"],
  hamstrings: ["hamstring"],
  lats: ["upper-back"],
  "lower back": ["lower-back"],
  "middle back": ["upper-back"],
  neck: ["neck"],
  quadriceps: ["quadriceps"],
  shoulders: ["front-deltoids", "back-deltoids"],
  traps: ["trapezius"],
  triceps: ["triceps"],
} as const satisfies Record<string, readonly Muscle[]>;

export function toSlugTotals(muscles: MuscleTotals) {
  const result: Record<
    string,
    { sets: number; exercises: string[]; muscles: string[] }
  > = {};
  for (const [muscle, slugs] of Object.entries(muscleSlugs)) {
    const total = muscles[muscle];
    if (!total) continue;
    for (const slug of slugs) {
      const target = (result[slug] ??= { sets: 0, exercises: [], muscles: [] });
      target.sets += total.sets;
      target.muscles.push(muscle);
      target.exercises = [
        ...new Set([...target.exercises, ...total.exercises]),
      ].sort();
    }
  }
  return result;
}

// Workload score: one point per primary working set; half per secondary set.
export function colorBucket(score: number, _range?: "7d" | "30d") {
  void _range; // Date range selects the records; workload points keep the same scale.
  return score <= 0 ? 0 : score < 10 ? 1 : score < 20 ? 2 : 3;
}
import type { Muscle } from "@plexapro/react-body-highlighter";
