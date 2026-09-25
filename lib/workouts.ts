import { z } from "zod";
export const workoutItemSchema = z
  .object({
    exerciseId: z.string().min(1).max(100),
    sets: z.number().int().min(1).max(100),
    mode: z.enum(["reps", "duration"]),
    reps: z
      .string()
      .trim()
      .regex(/^\d{1,4}(?:-\d{1,4})?$/)
      .default("10"),
    duration: z.number().int().min(1).max(86400).default(30),
    weight: z.number().min(0).max(1000).nullable().default(null),
    rest: z.number().int().min(0).max(3600),
    notes: z.string().trim().max(2000).default(""),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "reps") {
      const [a, b] = v.reps.split("-").map(Number);
      if (a < 1 || (b !== undefined && b < a))
        ctx.addIssue({
          code: "custom",
          message: "Enter a positive rep count or ascending range.",
          path: ["reps"],
        });
    }
  });
export const workoutSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(20000).default(""),
  exercises: z.array(workoutItemSchema).min(1).max(100),
  updatedAt: z.string().optional(),
});
// A recoverable draft may contain incomplete fields while the user is editing.
// Persistence still uses the stricter workoutSchema above.
export const workoutDraftSchema = workoutSchema.extend({
  name: z.string().max(120),
  exercises: z
    .array(
      z.object({
        exerciseId: z.string().min(1).max(100),
        sets: z.number(),
        mode: z.enum(["reps", "duration"]),
        reps: z.string().max(20),
        duration: z.number(),
        weight: z.number().nullable(),
        rest: z.number(),
        notes: z.string().max(2000),
      }),
    )
    .max(100),
});
export type WorkoutItem = z.infer<typeof workoutItemSchema>;
export type WorkoutInput = z.infer<typeof workoutSchema>;
export type Workout = WorkoutInput & {
  id: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};
export type Exercise = {
  id: string;
  name: string;
  images: string[];
  primary: string;
  secondary: string[];
  equipment: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  timed: boolean;
  instructions: string[];
  mistakes: string[];
  tips: string[];
  source?: string;
};
export function filterExercises(
  exercises: Exercise[],
  query: string,
  muscle: string,
  equipment: string,
  difficulty: string,
  sort: string,
) {
  return exercises
    .filter(
      (e) =>
        e.name.toLowerCase().includes(query.trim().toLowerCase()) &&
        (!muscle || e.primary === muscle) &&
        (!equipment || e.equipment === equipment) &&
        (!difficulty || e.difficulty === difficulty),
    )
    .sort((a, b) => {
      const levels = ["Beginner", "Intermediate", "Advanced"];
      return (
        (sort === "difficulty"
          ? levels.indexOf(a.difficulty) - levels.indexOf(b.difficulty)
          : sort === "muscle"
            ? a.primary.localeCompare(b.primary)
            : 0) || a.name.localeCompare(b.name)
      );
    });
}
