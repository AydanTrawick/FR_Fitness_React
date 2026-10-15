import { z } from "zod";
import { workoutSchema } from "../workouts.ts";

export const profileSchema = z.object({
  height_cm: z.number().min(80).max(250),
  sex: z.enum(["male", "female", "unspecified"]),
  birth_year: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getUTCFullYear() - 5),
  experience: z.enum(["beginner", "intermediate", "advanced"]),
  equipment: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  days_per_week: z.number().int().min(1).max(7),
  diet_restrictions: z.array(z.string().trim().min(1).max(120)).max(20),
  units_pref: z.enum(["imperial", "metric"]),
  hide_bodyfat: z.boolean().default(true),
});
export const checkinSchema = z.object({
  id: z.uuid(),
  weight_kg: z.number().min(20).max(400),
  energy: z.number().int().min(1).max(5),
  soreness: z.number().int().min(1).max(5),
  adherence: z.number().int().min(1).max(5),
  notes: z.string().trim().max(2000).default(""),
  profile: profileSchema,
});
export const goalSchema = z.object({
  type: z.enum([
    "lose_fat",
    "build_muscle",
    "gain_weight",
    "recomp",
    "get_stronger",
    "improve_posture",
  ]),
  focus_areas: z.array(z.string().trim().min(1).max(60)).max(6),
  target_weight_kg: z.number().min(20).max(400).nullable(),
  timeline_weeks: z.number().int().min(1).max(104),
  diet_restrictions: z.array(z.string().trim().min(1).max(120)).max(20),
  injuries: z.string().max(1500),
  food_budget: z.string().max(200),
});
export const nutritionSchema = z.object({
  diet_restrictions: z.array(z.string().trim().min(1).max(120)).max(30),
  calories: z.number().int().min(1200).max(7000).nullable(),
  protein_g: z.number().int().min(0).max(500).nullable(),
  carbs_g: z.number().int().min(0).max(1200).nullable(),
  fat_g: z.number().int().min(0).max(300).nullable(),
  note: z.string().min(1).max(2000),
  meals: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        ingredients: z.array(z.string().min(1).max(200)).min(1).max(20),
      }),
    )
    .min(3)
    .max(6),
  groceries: z.array(z.string().min(1).max(200)).min(1).max(60),
});
export const planSchema = z.object({
  training: z
    .array(
      workoutSchema
        .omit({ updatedAt: true })
        .extend({ day: z.string().min(1).max(30) }),
    )
    .min(1)
    .max(7),
  nutrition: nutritionSchema,
  habits: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        action: z.enum(["build", "drop"]),
        note: z.string().max(1000),
      }),
    )
    .min(3)
    .max(5),
  tips: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        note: z.string().min(1).max(2000),
      }),
    )
    .min(2)
    .max(8),
});
export const photoAnalysisSchema = z.object({
  photo_quality: z.object({
    usable: z.boolean(),
    issues: z.array(z.string().max(200)).max(10),
  }),
  overall_impression: z.string().max(1000),
  relative_development: z
    .array(
      z.object({
        area: z.string().max(60),
        level: z.enum(["lagging", "average", "strong"]),
        note: z.string().max(500),
      }),
    )
    .max(12),
  posture_notes: z.array(z.string().max(500)).max(10),
  bodyfat_estimate: z
    .object({
      range: z.string().regex(/^\d{1,2}-\d{1,2}%$/),
      confidence: z.literal("low"),
    })
    .nullable(),
  focus_recommendations: z.array(z.string().max(80)).max(8),
});
export type BodyProfile = z.infer<typeof profileSchema>;
export type Goal = z.infer<typeof goalSchema> & {
  safety_notes: string[];
  target_date: string;
};
export type Plan = z.infer<typeof planSchema>;
export type Checkin = {
  id: string;
  created_at: string;
  weight_kg: number;
  energy: number;
  soreness: number;
  adherence: number;
  notes: string;
  photos: { id: string; pose: string }[];
};
export type Card =
  | { kind: "goal"; id: string; goal: Goal; status: string }
  | {
      kind: "adjustment";
      id: string;
      reason: string;
      summary: string;
      status: string;
    };
export type CoachMessage = {
  id: string;
  role: "user" | "assistant";
  content: { text: string; cards?: Card[] };
  created_at: string;
};
export type Playbook = {
  id: string;
  goal_id: string;
  version: number;
  created_at: string;
  plan: Plan;
  goal: Goal;
  items: { id: string; type: string; sort_order: number; done: boolean }[];
};
export type ProgressState = {
  profile: BodyProfile | null;
  checkins: Checkin[];
  messages: CoachMessage[];
  playbook: Playbook | null;
  adjustments: Card[];
  photoConsent: boolean;
  capabilities: { coach: boolean; photos: boolean };
};
export const goalLabels: Record<Goal["type"], string> = {
  lose_fat: "Lose fat",
  build_muscle: "Build muscle",
  gain_weight: "Gain weight",
  recomp: "Recomp",
  get_stronger: "Get stronger",
  improve_posture: "Improve posture",
};
export const DISCLAIMER =
  "General fitness guidance, not medical advice. Check with a doctor before starting a new program, especially if you have health conditions.";
export const toKg = (weight: number, units: string) =>
  units === "imperial" ? weight * 0.45359237 : weight;
export const fromKg = (weight: number, units: string) =>
  units === "imperial" ? weight / 0.45359237 : weight;
