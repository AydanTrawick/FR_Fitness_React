import type { Exercise } from "./workouts";

export const EXERCISE_DATA_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
export const EXERCISE_IMAGE_PREFIX =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

export type ExerciseRow = {
  id: string;
  name: string;
  primary_muscles: string[];
  primary_muscle: string | null;
  secondary_muscles: string[];
  movement_pattern: string | null;
  equipment: string | null;
  is_compound: boolean | null;
  force: string | null;
  level: string | null;
  mechanic: string | null;
  category: string | null;
  instructions: string[];
  images: string[];
  metadata: {
    timed?: boolean;
    mistakes?: string[];
    tips?: string[];
    source?: string;
  } | null;
  source: string;
};

export function exerciseImageUrl(path: string): string {
  if (path.startsWith(EXERCISE_IMAGE_PREFIX)) return path;
  if (path.startsWith("/")) return path; // Preserved FirstRep images.
  if (!/^[A-Za-z0-9_./-]+$/.test(path) || path.includes(".."))
    throw new Error("Invalid exercise image path");
  return `${EXERCISE_IMAGE_PREFIX}${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function toLibraryExercise(row: ExerciseRow): Exercise {
  const difficulty = row.level?.toLowerCase();
  return {
    id: row.id,
    name: row.name,
    images: row.images.length
      ? row.images.map(exerciseImageUrl)
      : ["/exercises/placeholder.svg"],
    primary: row.primary_muscle ?? row.primary_muscles[0] ?? "Other",
    secondary: row.secondary_muscles,
    equipment: row.equipment ?? "Other",
    difficulty:
      difficulty === "intermediate"
        ? "Intermediate"
        : difficulty === "advanced"
          ? "Advanced"
          : "Beginner",
    timed:
      row.metadata?.timed ??
      (row.category === "cardio" || row.category === "stretching"),
    instructions: row.instructions,
    mistakes: row.metadata?.mistakes ?? [],
    tips: row.metadata?.tips ?? [],
    source:
      row.source === "free-exercise-db"
        ? `https://github.com/yuhonas/free-exercise-db/blob/main/exercises/${encodeURIComponent(row.id)}.json`
        : row.metadata?.source,
  };
}
