import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  goalSchema,
  profileSchema,
  planSchema,
  toKg,
  fromKg,
} from "../lib/progress/schema.ts";
import {
  calorieFloor,
  isAdult,
  needsSupport,
  safeGoal,
  validatePlanSafety,
} from "../lib/progress/safety.ts";
import { signPhoto, verifyPhoto } from "../lib/progress/photo-token.ts";
import {
  normalizeProgressPhoto,
  privateR2Domains,
} from "../lib/progress/image.ts";
const now = new Date("2026-10-07T12:00:00Z");
const profile = profileSchema.parse({
  height_cm: 180,
  sex: "male",
  birth_year: 1996,
  experience: "beginner",
  equipment: ["Full gym"],
  days_per_week: 3,
  diet_restrictions: ["no pork"],
  units_pref: "imperial",
});
const goal = goalSchema.parse({
  type: "lose_fat",
  focus_areas: [],
  target_weight_kg: 66.4,
  timeline_weeks: 4,
  diet_restrictions: [],
  injuries: "None",
  food_budget: "Moderate",
});
test("weight conversions preserve canonical kg and validate profile inputs", () => {
  assert.ok(Math.abs(fromKg(toKg(160, "imperial"), "imperial") - 160) < 1e-10);
  assert.equal(toKg(73, "metric"), 73);
  assert.equal(
    profileSchema.safeParse({ ...profile, height_cm: 0 }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({ ...profile, days_per_week: 8 }).success,
    false,
  );
});
test("rapid loss gets a safe timeline and restrictions persist", () => {
  const result = safeGoal(goal, profile, 80, now);
  assert.equal(result.timeline_weeks, 17);
  assert.ok((80 - result.target_weight_kg) / result.timeline_weeks <= 0.8);
  assert.deepEqual(result.diet_restrictions, ["no pork"]);
  assert.ok(result.safety_notes.length);
});
test("lean bulk gain is capped at one lb per week and implausible low targets are refused", () => {
  const result = safeGoal(
    { ...goal, type: "gain_weight", target_weight_kg: 90 },
    profile,
    80,
    now,
  );
  assert.equal(result.timeline_weeks, 23);
  const low = safeGoal({ ...goal, target_weight_kg: 40 }, profile, 80, now);
  assert.equal(low.target_weight_kg, null);
  assert.ok(low.safety_notes[0].includes("professional"));
});
test("minors get no target weight; sex floors and BMR both apply", () => {
  const minor = { ...profile, birth_year: 2012 };
  assert.equal(isAdult(minor, now), false);
  assert.equal(safeGoal(goal, minor, 80, now).target_weight_kg, null);
  assert.equal(calorieFloor(profile, 80, now), 1780);
  assert.ok(calorieFloor({ ...profile, sex: "female" }, 80, now) >= 1200);
});
test("recognized disordered eating triggers supportive handling", () => {
  for (const text of [
    "I am purging",
    "I skip meals to punish myself",
    "800 calories a day",
    "I starve myself",
  ])
    assert.equal(needsSupport(text), true, text);
  assert.equal(needsSupport("Build my chest and train four days"), false);
});
const workout = {
  day: "Monday",
  name: "Full body",
  description: "Add reps gradually",
  exercises: [
    { exerciseId: "bench", sets: 3, mode: "reps", reps: "8-12", rest: 90 },
  ],
};
const plan = planSchema.parse({
  training: [
    workout,
    { ...workout, day: "Wednesday" },
    { ...workout, day: "Friday" },
  ],
  nutrition: {
    diet_restrictions: ["no pork"],
    calories: 2600,
    protein_g: 140,
    carbs_g: 340,
    fat_g: 75,
    note: "Estimated targets",
    meals: ["Breakfast", "Lunch", "Dinner"].map((name) => ({
      name,
      ingredients: ["Tofu", "Rice"],
    })),
    groceries: ["Tofu", "Rice"],
  },
  habits: ["Sleep", "Walk", "Regular meals"].map((title) => ({
    title,
    action: "build",
    note: "Start small",
  })),
  tips: [
    { title: "Form", note: "Move with control" },
    { title: "Recovery", note: "Take rest days" },
  ],
});
test("plans reject low calories, inconsistent macros, wrong schedule and numeric minor targets", () => {
  assert.doesNotThrow(() => validatePlanSafety(plan, profile, 80));
  assert.throws(
    () =>
      validatePlanSafety(
        { ...plan, nutrition: { ...plan.nutrition, calories: 1200 } },
        profile,
        80,
      ),
    /BMR/,
  );
  assert.throws(
    () =>
      validatePlanSafety(
        {
          ...plan,
          nutrition: { ...plan.nutrition, protein_g: 1, carbs_g: 1, fat_g: 1 },
        },
        profile,
        80,
      ),
    /10%/,
  );
  assert.throws(
    () => validatePlanSafety({ ...plan, training: [workout] }, profile, 80),
    /days/,
  );
  assert.throws(
    () =>
      validatePlanSafety(
        plan,
        { ...profile, birth_year: new Date().getUTCFullYear() - 16 },
        80,
      ),
    /Under-18/,
  );
});
test("photo signatures enforce ownership, object identity, expiry and maximum lifetime", () => {
  const signature = signPhoto("test-secret", "user-a", "photo-a", 1500);
  assert.equal(
    verifyPhoto("test-secret", "user-a", "photo-a", 1500, signature, 1000),
    true,
  );
  assert.equal(
    verifyPhoto("test-secret", "user-b", "photo-a", 1500, signature, 1000),
    false,
  );
  assert.equal(
    verifyPhoto("test-secret", "user-a", "photo-b", 1500, signature, 1000),
    false,
  );
  assert.equal(
    verifyPhoto("test-secret", "user-a", "photo-a", 1500, signature, 1500),
    false,
  );
  assert.equal(
    verifyPhoto("test-secret", "user-a", "photo-a", 1500, signature, 899),
    false,
  );
  assert.equal(
    verifyPhoto("test-secret", "user-a", "photo-a", 1500, "invalid", 1000),
    false,
  );
});
test("public or ambiguous R2 bucket settings fail closed", () => {
  assert.equal(privateR2Domains({ enabled: false }, { domains: [] }), true);
  assert.equal(privateR2Domains({ enabled: true }, { domains: [] }), false);
  assert.equal(
    privateR2Domains({ enabled: false }, { domains: [{ enabled: true }] }),
    false,
  );
  assert.equal(privateR2Domains({}, { domains: [] }), false);
  assert.equal(privateR2Domains({ enabled: false }, {}), false);
});
test("photo normalization strips EXIF and bounds both dimensions", async () => {
  const source = await sharp({
    create: { width: 2400, height: 1800, channels: 3, background: "#888" },
  })
    .withMetadata({ exif: { IFD0: { Copyright: "private metadata" } } })
    .jpeg()
    .toBuffer();
  assert.ok((await sharp(source).metadata()).exif);
  const normalized = await normalizeProgressPhoto(source);
  const metadata = await sharp(normalized.data).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.exif, undefined);
  assert.ok(metadata.width <= 1600 && metadata.height <= 1600);
  await assert.rejects(() =>
    normalizeProgressPhoto(Buffer.from("invalid image")),
  );
});
