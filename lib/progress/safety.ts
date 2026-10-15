import {
  goalSchema,
  type BodyProfile,
  type Goal,
  type Plan,
} from "./schema.ts";

export const SUPPORT_MESSAGE =
  "You deserve support and regular nourishment. I can help with gentle movement and balanced habits, but I won’t set restrictive calorie or rapid weight-change targets. Please talk with a qualified healthcare professional. In the U.S., the National Alliance for Eating Disorders helpline is 866-662-1235 (Mon–Fri); visit allianceforeatingdisorders.com for support. If you’re in immediate danger, contact emergency services.";
export function needsSupport(text: string) {
  return /purging|\bpurge\b|make myself (vomit|throw up)|starv(?:e|ing) myself|punish myself|(?:skip|stop|avoid)(?:ping)? (?:all )?(?:meals|eating|food)|(?:500|600|700|800|900)\s*(?:k?cal|calories)|eating disorder|anorexi|bulimi/i.test(
    text,
  );
}
export function isAdult(profile: BodyProfile, now = new Date()) {
  return now.getUTCFullYear() - profile.birth_year >= 18;
}
export function calorieFloor(
  profile: BodyProfile,
  weight: number,
  now = new Date(),
) {
  const age = now.getUTCFullYear() - profile.birth_year;
  // Use the higher estimate for an unspecified sex; targets remain estimates.
  const bmr =
    10 * weight +
    6.25 * profile.height_cm -
    5 * age +
    (profile.sex === "female" ? -161 : 5);
  return Math.ceil(Math.max(profile.sex === "female" ? 1200 : 1500, bmr));
}
export function safeGoal(
  input: unknown,
  profile: BodyProfile,
  weight: number,
  now = new Date(),
): Goal {
  const goal = goalSchema.parse(input);
  const notes: string[] = [];
  goal.diet_restrictions = [
    ...new Set([...profile.diet_restrictions, ...goal.diet_restrictions]),
  ];
  if (!isAdult(profile, now)) {
    goal.target_weight_kg = null;
    notes.push(
      "For under-18s, focus on balanced meals, movement, and recovery. Discuss weight changes with a qualified professional.",
    );
  } else if (goal.target_weight_kg != null) {
    const delta = goal.target_weight_kg - weight;
    // Loss cap is conservative: linear 1%/week is further bounded by a 5% buffer above BMI 18.5.
    const minimumWeight = 18.5 * (profile.height_cm / 100) ** 2;
    if (delta < 0 && goal.target_weight_kg < minimumWeight * 1.05) {
      goal.target_weight_kg = null;
      notes.push(
        "A weight-loss target near or below the lower healthy BMI range needs professional review. Focus on strength and balanced habits.",
      );
    } else {
      const rate = delta < 0 ? weight * 0.01 : 0.45359237;
      const weeks = Math.ceil(Math.abs(delta) / rate);
      if (weeks > goal.timeline_weeks) {
        if (weeks <= 104) goal.timeline_weeks = weeks;
        else
          goal.target_weight_kg = Number(
            (weight + Math.sign(delta) * rate * goal.timeline_weeks).toFixed(2),
          );
        notes.push(
          delta < 0
            ? "Timeline adjusted to limit loss to 1% of baseline bodyweight per week; reassess as weight changes."
            : "Timeline adjusted to limit lean-bulk gain to about 1 lb per week.",
        );
      }
    }
  }
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + goal.timeline_weeks * 7);
  return {
    ...goal,
    target_date: date.toISOString().slice(0, 10),
    safety_notes: notes,
  };
}
export function validatePlanSafety(
  plan: Plan,
  profile: BodyProfile,
  weight: number,
) {
  if (plan.training.length !== profile.days_per_week)
    throw new Error("Training days must match the profile.");
  if (!isAdult(profile)) {
    if (
      [
        plan.nutrition.calories,
        plan.nutrition.protein_g,
        plan.nutrition.carbs_g,
        plan.nutrition.fat_g,
      ].some((v) => v != null)
    )
      throw new Error(
        "Under-18 plans must use balanced meals without numeric calorie or macro targets.",
      );
  } else {
    const n = plan.nutrition;
    if (n.calories == null || n.calories < calorieFloor(profile, weight))
      throw new Error(
        "Calorie target must meet the sex-specific floor and estimated BMR.",
      );
    if (n.protein_g == null || n.carbs_g == null || n.fat_g == null)
      throw new Error("Adult plans require macro estimates.");
    if (
      Math.abs(4 * n.protein_g + 4 * n.carbs_g + 9 * n.fat_g - n.calories) >
      n.calories * 0.1
    )
      throw new Error(
        "Macro calories must be within 10% of the calorie target.",
      );
  }
}
