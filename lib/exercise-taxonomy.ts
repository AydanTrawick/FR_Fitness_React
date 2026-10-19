import type { Pattern } from "./analysis/types";

export const targetMuscles = [
  "abdominals",
  "abductors",
  "adductors",
  "biceps",
  "calves",
  "chest",
  "forearms",
  "glutes",
  "hamstrings",
  "lats",
  "lower back",
  "middle back",
  "neck",
  "quadriceps",
  "shoulders",
  "traps",
  "triceps",
] as const;
export function canonicalMuscle(value: string) {
  const muscle = value.toLowerCase().trim();
  return (
    (
      { core: "abdominals", abs: "abdominals", back: "middle back" } as Record<
        string,
        string
      >
    )[muscle] ?? muscle
  );
}
// Only equivalent movements are merged; equipment and movement variants remain distinct.
export const legacyExerciseAliases: Record<string, string> = {
  bicyclecrunch: "Air_Bike",
  "box-jump": "Front_Box_Jump",
  bulgariansplitsquat: "Split_Squat_with_Dumbbells",
  cablewoodchop: "Standing_Cable_Wood_Chop",
  skullcrusher: "Lying_Triceps_Press",
  triceppushdown: "Triceps_Pushdown",
  bench: "Barbell_Bench_Press_-_Medium_Grip",
  bbsquat: "Barbell_Squat",
  adductor: "Thigh_Adductor",
  battleropes: "Battling_Ropes",
  "bench-dip": "Bench_Dips",
  "box-squat": "Box_Squat",
  "cable-curl": "Standing_Biceps_Cable_Curl",
  "cable-lateral-raise": "Standing_Low-Pulley_Deltoid_Raise",
  "cable-pull-through": "Pull_Through",
  cablecrossover: "Cable_Crossover",
  calfraise: "Standing_Dumbbell_Calf_Raise",
  chestfly: "Dumbbell_Flyes",
  "close-grip-bench-press": "Close-Grip_Barbell_Bench_Press",
  "concentration-curl": "Concentration_Curls",
  crunch: "Crunches",
  cycling: "Bicycling_Stationary",
  dbcurl: "Dumbbell_Bicep_Curl",
  dbincline: "Incline_Dumbbell_Press",
  dbrow: "One-Arm_Dumbbell_Row",
  dbshoulderpress: "Dumbbell_Shoulder_Press",
  deadbug: "Dead_Bug",
  dip: "Dips_-_Chest_Version",
  "dumbbell-floor-press": "Dumbbell_Floor_Press",
  elliptical: "Elliptical_Trainer",
  facepull: "Face_Pull",
  "front-squat": "Front_Barbell_Squat",
  "glute-bridge": "Butt_Lift_Bridge",
  glutekickback: "One-Legged_Cable_Kickback",
  gobletsquat: "Goblet_Squat",
  hacksquat: "Hack_Squat",
  hammer: "Hammer_Curls",
  hipthrust: "Barbell_Hip_Thrust",
  jumprope: "Rope_Jumping",
  latpulldown: "Wide-Grip_Lat_Pulldown",
  latraise: "Side_Lateral_Raise",
  legcurl: "Seated_Leg_Curl",
  legextension: "Leg_Extensions",
  legpress: "Leg_Press",
  legraise: "Flat_Bench_Lying_Leg_Raise",
  lunge: "Dumbbell_Lunges",
  "lying-leg-curl": "Lying_Leg_Curls",
  mtclimber: "Mountain_Climbers",
  overheadtri: "Standing_Dumbbell_Triceps_Extension",
  "pallof-press": "Pallof_Press",
  "pec-deck": "Butterfly",
  plank: "Plank",
  preachercurl: "Preacher_Curl",
  pullups: "Pullups",
  pushup: "Pushups",
  rdl: "Romanian_Deadlift",
  reardeltfly: "Reverse_Flyes",
  "reverse-crunch": "Reverse_Crunch",
  "reverse-lunge": "Dumbbell_Rear_Lunge",
  "rope-overhead-tricep-extension": "Cable_Rope_Overhead_Triceps_Extension",
  rowing: "Rowing_Stationary",
  russiantwist: "Russian_Twist",
  seatedcalfraise: "Seated_Calf_Raise",
  seatedrow: "Seated_Cable_Rows",
  sideplank: "Side_Bridge",
  smithincline: "Smith_Machine_Incline_Bench_Press",
  stairmaster: "Step_Mill",
  stepup: "Dumbbell_Step_Ups",
  sumodeadlift: "Sumo_Deadlift",
  "t-bar-row": "T-Bar_Row_with_Handle",
  tmwalk: "Walking_Treadmill",
  "upright-row": "Upright_Barbell_Row",
};
export type TaxonomyExercise = {
  id: string;
  name: string;
  primary_muscle?: string | null;
  primary_muscles?: string[];
  secondary_muscles?: string[];
  movement_pattern?: string | null;
  force?: string | null;
  category?: string | null;
  source?: string;
  aliases?: string[];
};
export function normalizeExercise<T extends TaxonomyExercise>(row: T): T {
  const fullBody: Record<string, string[]> = {
    "assault-bike": ["quadriceps", "shoulders"],
    burpee: ["quadriceps", "chest", "abdominals"],
    "farmers-carry": ["traps", "forearms", "quadriceps"],
    steadyrun: ["quadriceps", "hamstrings", "calves"],
  };
  const targets = fullBody[row.id];
  const primary =
    targets?.[0] ||
    canonicalMuscle(row.primary_muscle || row.primary_muscles?.[0] || "");
  return {
    ...row,
    primary_muscle: primary,
    primary_muscles: (
      targets ?? (row.primary_muscles?.length ? row.primary_muscles : [primary])
    ).map(canonicalMuscle),
    secondary_muscles: [
      ...new Set((row.secondary_muscles ?? []).map(canonicalMuscle)),
    ],
  };
}
export function canonicalCatalog<T extends TaxonomyExercise>(rows: T[]): T[] {
  const upstream = rows.filter((e) => e.source === "free-exercise-db");
  const ids = new Set(upstream.map((e) => e.id));
  const names = new Map(
    upstream.map((e) => [e.name.toLowerCase().replace(/[^a-z0-9]/g, ""), e.id]),
  );
  const aliases = new Map<string, string[]>();
  const unique = rows.filter((e) => {
    if (e.source === "free-exercise-db") return true;
    const target =
      (ids.has(legacyExerciseAliases[e.id])
        ? legacyExerciseAliases[e.id]
        : undefined) ??
      (e.id === "assault-bike"
        ? undefined
        : names.get(e.name.toLowerCase().replace(/[^a-z0-9]/g, "")));
    if (!target) return true;
    aliases.set(target, [...(aliases.get(target) ?? []), e.id]);
    return false;
  });
  return unique.map((e) => ({
    ...normalizeExercise(e),
    aliases: aliases.get(e.id) ?? [],
  }));
}
export function exercisePattern(e: TaxonomyExercise): Pattern | null {
  if (
    ["push", "pull", "hinge", "squat", "carry", "core"].includes(
      e.movement_pattern || "",
    )
  )
    return e.movement_pattern as Pattern;
  if (["cardio", "stretching"].includes(e.category || "")) return null;
  const name = e.name.toLowerCase().replace(/[_-]/g, " ");
  if (
    /pallof|wood\s*chop|crunch|plank|sit\s*up|dead bug|leg raise|knee raise|russian twist|hollow body|v up/.test(
      name,
    )
  )
    return "core";
  if (/farmer|carry|suitcase walk/.test(name)) return "carry";
  if (
    /deadlift|good morning|hip thrust|glute bridge|butt lift|pull through|kettlebell swing/.test(
      name,
    )
  )
    return "hinge";
  if (/squat|lunge|leg press|step up/.test(name)) return "squat";
  if (canonicalMuscle(e.primary_muscle || "") === "abdominals") return "core";
  if (e.force === "push") return "push";
  if (e.force === "pull") return "pull";
  if (
    /press|push\s*up|pushdown|push down|dip|triceps extension|flye|chest fly/.test(
      name,
    )
  )
    return "push";
  if (/row|pull\s*up|pulldown|pull down|chin\s*up|curl|face pull/.test(name))
    return "pull";
  return null;
}
