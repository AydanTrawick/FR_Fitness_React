import { z } from "zod";
const nutrient = z.number().finite().min(0).max(500).nullable().optional();
export const workoutInput = z
  .object({
    exercise_name: z.string().trim().min(1).max(300),
    exercise_id: z.string().min(1).max(100).nullable().optional(),
    custom: z.boolean().optional(),
    sets: z
      .array(
        z
          .object({
            reps: z.number().int().min(1).max(100),
            weight: z.number().finite().min(0).max(1500).nullable().optional(),
            unit: z.enum(["lb", "kg", "bodyweight"]).optional(),
            rpe: z
              .number()
              .min(1)
              .max(10)
              .multipleOf(0.5)
              .nullable()
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    performed_at: z.string().datetime({ offset: true }).optional(),
    notes: z.string().max(2000).default(""),
  })
  .strict();
export const foodInput = z
  .object({
    food_name: z.string().trim().min(1).max(300),
    meal: z
      .enum(["breakfast", "lunch", "dinner", "snack", "unspecified"])
      .default("unspecified"),
    protein_g: nutrient,
    carbs_g: nutrient,
    fat_g: nutrient,
    calories: z.number().finite().min(0).max(10000).nullable().optional(),
    log_date: z.string().date().optional(),
    values_source: z.enum(["user_stated", "assistant_estimate"]),
  })
  .strict();
export type WorkoutPayload = z.infer<typeof workoutInput> & { date: string };
export type FoodPayload = z.infer<typeof foodInput>;
export type PendingAction = {
  id: string;
  kind: "workout_set" | "food";
  status: string;
  payload: WorkoutPayload | FoodPayload;
  expires_at: string;
  candidates?: { id: string; name: string }[];
};
export function dateInZone(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function prepareWorkout(
  input: unknown,
  context: { now: Date; timezone: string; unit?: string },
): WorkoutPayload {
  const data = workoutInput.parse(input);
  const performed_at = data.performed_at ?? context.now.toISOString();
  return {
    ...data,
    performed_at,
    date: dateInZone(new Date(performed_at), context.timezone),
    sets: data.sets.map((set) => {
      const unit =
        set.unit ??
        (context.unit === "kg"
          ? "kg"
          : context.unit === "lb"
            ? "lb"
            : undefined);
      if (!unit)
        throw new Error(
          "Which weight unit did you use: lb, kg, or bodyweight?",
        );
      if (unit !== "bodyweight" && set.weight == null)
        throw new Error("What weight did you use, or was it bodyweight?");
      if (unit === "bodyweight" && set.weight != null && set.weight !== 0)
        throw new Error(
          "For added weight, choose lb or kg instead of bodyweight.",
        );
      const kg = (set.weight ?? 0) * (unit === "lb" ? 0.45359237 : 1);
      if (kg > 1500 * 0.45359237)
        throw new Error(
          "Please use a weight no greater than 1,500 lb (680.4 kg).",
        );
      return { ...set, unit, weight: set.weight ?? null, rpe: set.rpe ?? null };
    }),
  };
}
export function prepareFood(
  input: unknown,
  context: { now: Date; timezone: string },
): FoodPayload {
  const data = foodInput.parse(input);
  if (
    [data.protein_g, data.carbs_g, data.fat_g, data.calories].every(
      (v) => v == null,
    )
  )
    throw new Error("Which nutrient amount or calories should I log?");
  return {
    ...data,
    log_date: data.log_date ?? dateInZone(context.now, context.timezone),
    protein_g: data.protein_g ?? null,
    carbs_g: data.carbs_g ?? null,
    fat_g: data.fat_g ?? null,
    calories: data.calories ?? null,
  };
}
export const chatInput = z
  .object({
    prompt: z.string().trim().min(1).max(10000),
    conversationId: z.string().uuid(),
    requestId: z.string().uuid(),
    mode: z.enum(["text", "voice"]).default("text"),
    activeActionId: z.string().uuid().optional(),
    confirmationPayload: z.unknown().optional(),
    history: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().max(20000),
        }),
      )
      .max(12)
      .default([]),
    includeTrainingHistory: z.boolean().default(false),
  })
  .strict();
