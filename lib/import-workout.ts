import type { Exercise, WorkoutInput } from "./workouts";
// Imported prose remains intact for review. Only exact catalog names are matched;
// ambiguous names and prescriptions are never silently guessed.
export function importWorkout(text: string, catalog: Exercise[]): WorkoutInput {
  const found = catalog.filter((e) =>
    text.toLowerCase().includes(e.name.toLowerCase()),
  );
  return {
    name: "AI workout draft",
    description: text.slice(0, 20000),
    exercises: found.map((e) => ({
      exerciseId: e.id,
      sets: 3,
      mode: e.timed ? "duration" : "reps",
      duration: 30,
      reps: "8-12",
      weight: null,
      rest: 60,
      notes:
        "Imported from an AI draft. Review sets, reps, rest and exercise selection against the original plan above.",
    })),
  };
}
