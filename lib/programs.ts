export type Alternative = {
  name: string;
  exerciseId: string | null;
  muscle: string;
  equipment: string;
  cues: string[];
};
export type ProgramExercise = Alternative & {
  sets: number;
  reps: string;
  rest: number;
  restSeconds: number;
  alternatives: Alternative[];
};
export type Program = {
  id: string;
  title: string;
  description: string;
  level: string;
  goal: string;
  focus: { strength: number; muscle: number; conditioning: number };
  weekSchedule: { kind: string; label: string; dayIndex: number | null }[];
  schedule: {
    day: string;
    title: string;
    duration: number;
    exercises: ProgramExercise[];
  }[];
};
export type LoggedSet = {
  id: string;
  exercise_index: number;
  set_index: number;
  weight_kg: number;
  reps: number | null;
  duration_seconds: number | null;
  distance_m: number | null;
  rpe: number;
};
export type ProgramSession = {
  id: string;
  program_id: string;
  day_index: number;
  completed_at: string | null;
  exercises: ProgramExercise[];
  sets: LoggedSet[];
};
export type ProgramState = {
  unit: "lb" | "kg";
  date: string;
  weekStart: string;
  preferences: {
    program_id: string;
    bookmarked: boolean;
    swaps: Record<string, number>;
  }[];
  sessions: ProgramSession[];
  last: {
    exercise: string;
    exercise_id: string | null;
    weight_kg: number;
    reps: number;
  }[];
};
export function durationLabel(program: Program) {
  const times = program.schedule.map((d) => d.duration),
    min = Math.min(...times),
    max = Math.max(...times);
  return `${min === max ? min : `${min}–${max}`} min`;
}
export function matchesFilters(
  program: Program,
  days: string,
  length: string,
  goal: string,
) {
  const max = Math.max(...program.schedule.map((d) => d.duration));
  return (
    (days === "Any" || program.schedule.length === Number(days)) &&
    (goal === "Any" || program.goal === goal) &&
    (length === "Any" ||
      (length === "<45"
        ? max < 45
        : length === "45–60"
          ? max >= 45 && max <= 60
          : max >= 60))
  );
}
export function target(reps: string) {
  const value = Number(reps.match(/\d+/)?.[0] || 1);
  if (/meter|\d\s*m\b/i.test(reps) && !/min/i.test(reps))
    return {
      kind: "distance" as const,
      value,
      step: 25,
      label: "Distance (m)",
    };
  if (/sec|min/i.test(reps))
    return {
      kind: "duration" as const,
      value: value * (/min/i.test(reps) ? 60 : 1),
      step: 15,
      label: "Time (s)",
    };
  return { kind: "reps" as const, value, step: 1, label: "Reps done" };
}
export function weekStart(date: string) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function effectiveExercises(
  program: Program,
  day: number,
  swaps: Record<string, number> = {},
) {
  return program.schedule[day].exercises.map((e, i) => {
    const alternative = e.alternatives[swaps[`${day}:${i}`]];
    // Keep the original prescription when changing movement; never turn time/distance into reps.
    return alternative ? { ...e, ...alternative } : e;
  });
}
export function muscleSets(exercises: ProgramExercise[]) {
  const totals = new Map<string, number>();
  exercises.forEach((e) =>
    totals.set(e.muscle, (totals.get(e.muscle) || 0) + e.sets),
  );
  return [...totals.entries()];
}
export function displayWeight(kg: number, unit: "lb" | "kg") {
  return Math.round(kg * (unit === "lb" ? 2.2046226218 : 1) * 10) / 10;
}
export function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
