import { guidance } from "./exercise-guidance.mjs";
// Explicit, visually reviewed mapping. Never infer exercise identity at runtime.
import fs from "node:fs";
const rows = `bench|Barbell bench press|Chest|Barbells|Intermediate|Triceps,Shoulders
bbsquat|Barbell back squat|Quadriceps|Barbells|Intermediate|Glutes,Core
adductor|Seated hip adduction|Adductors|Machines|Beginner|
assault-bike|Air bike|Full Body|Machines|Beginner|Quadriceps
battleropes|Battle ropes|Full Body|Battle Ropes|Intermediate|Shoulders,Core
bench-dip|Bench dip|Triceps|Bodyweight|Intermediate|Shoulders
bicyclecrunch|Bicycle crunch|Core|Bodyweight|Beginner|
box-jump|Box jump|Quadriceps|Box|Advanced|Glutes,Calves
box-squat|Box squat|Quadriceps|Barbells|Intermediate|Glutes
bulgariansplitsquat|Bulgarian split squat|Quadriceps|Dumbbells|Intermediate|Glutes
burpee|Burpee|Full Body|Bodyweight|Advanced|Core
cable-curl|Cable curl|Biceps|Cables|Beginner|
cable-lateral-raise|Cable lateral raise|Shoulders|Cables|Beginner|
cable-pull-through|Cable pull-through|Glutes|Cables|Intermediate|Hamstrings
cablecrossover|Cable crossover|Chest|Cables|Beginner|Shoulders
cablewoodchop|Cable woodchop|Core|Cables|Intermediate|Shoulders
calfraise|Standing dumbbell calf raise|Calves|Dumbbells|Beginner|
chest-supported-row|Chest-supported machine row|Back|Machines|Beginner|Biceps
chestfly|Dumbbell chest fly|Chest|Dumbbells|Intermediate|Shoulders
close-grip-bench-press|Close-grip bench press|Triceps|Barbells|Intermediate|Chest,Shoulders
concentration-curl|Concentration curl|Biceps|Dumbbells|Beginner|
crunch|Crunch|Core|Bodyweight|Beginner|
cycling|Stationary cycling|Quadriceps|Machines|Beginner|Glutes
dbcurl|Dumbbell curl|Biceps|Dumbbells|Beginner|
dbincline|Incline dumbbell press|Chest|Dumbbells|Intermediate|Shoulders,Triceps
dbrow|Single-arm dumbbell row|Back|Dumbbells|Beginner|Biceps
dbshoulderpress|Dumbbell shoulder press|Shoulders|Dumbbells|Intermediate|Triceps
deadbug|Dead bug|Core|Bodyweight|Beginner|
dip|Parallel-bar dip|Chest|Bodyweight|Intermediate|Triceps,Shoulders
dumbbell-floor-press|Dumbbell floor press|Chest|Dumbbells|Beginner|Triceps
elliptical|Elliptical trainer|Full Body|Machines|Beginner|Quadriceps
facepull|Cable face pull|Shoulders|Cables|Beginner|Back
farmers-carry|Kettlebell farmer carry|Full Body|Kettlebells|Intermediate|Core
front-squat|Front squat|Quadriceps|Barbells|Advanced|Glutes,Core
glute-bridge|Glute bridge|Glutes|Bodyweight|Beginner|Hamstrings
glutekickback|Cable glute kickback|Glutes|Cables|Beginner|Hamstrings
gobletsquat|Dumbbell goblet squat|Quadriceps|Dumbbells|Beginner|Glutes
hacksquat|Hack squat|Quadriceps|Machines|Intermediate|Glutes
hammer|Hammer curl|Biceps|Dumbbells|Beginner|
hanging-knee-raise|Hanging knee raise|Core|Bodyweight|Intermediate|
hipthrust|Barbell hip thrust|Glutes|Barbells|Intermediate|Hamstrings
hollow-body-hold|Hollow body hold|Core|Bodyweight|Intermediate|
jumprope|Jump rope|Full Body|Jump Rope|Beginner|Calves
kettlebell-swing|Kettlebell swing|Glutes|Kettlebells|Intermediate|Hamstrings,Core
latpulldown|Lat pulldown|Back|Cables|Beginner|Biceps
latraise|Dumbbell lateral raise|Shoulders|Dumbbells|Beginner|
legcurl|Seated leg curl|Hamstrings|Machines|Beginner|Calves
legextension|Leg extension|Quadriceps|Machines|Beginner|
legpress|Leg press|Quadriceps|Machines|Beginner|Glutes
legraise|Lying leg raise|Core|Bodyweight|Intermediate|
lunge|Dumbbell lunge|Quadriceps|Dumbbells|Intermediate|Glutes
lying-leg-curl|Lying leg curl|Hamstrings|Machines|Beginner|Calves
mtclimber|Mountain climber|Full Body|Bodyweight|Intermediate|Core
overheadtri|Dumbbell overhead triceps extension|Triceps|Dumbbells|Intermediate|
pallof-press|Pallof press|Core|Cables|Beginner|
pec-deck|Pec deck fly|Chest|Machines|Beginner|Shoulders
plank|Forearm plank|Core|Bodyweight|Beginner|
preachercurl|EZ-bar preacher curl|Biceps|Barbells|Beginner|
pullups|Pull-up|Back|Bodyweight|Intermediate|Biceps
pushup|Push-up|Chest|Bodyweight|Beginner|Triceps,Core
rdl|Barbell Romanian deadlift|Hamstrings|Barbells|Intermediate|Glutes,Back
reardeltfly|Dumbbell rear delt fly|Shoulders|Dumbbells|Intermediate|Back
reverse-crunch|Reverse crunch|Core|Bodyweight|Beginner|
reverse-lunge|Dumbbell reverse lunge|Quadriceps|Dumbbells|Intermediate|Glutes
rope-overhead-tricep-extension|Cable overhead triceps extension|Triceps|Cables|Intermediate|
rowing|Rowing machine|Full Body|Machines|Beginner|Back,Quadriceps
russiantwist|Russian twist|Core|Bodyweight|Intermediate|
seatedcalfraise|Seated calf raise|Calves|Machines|Beginner|
seatedrow|Seated cable row|Back|Cables|Beginner|Biceps
sideplank|Side plank|Core|Bodyweight|Intermediate|
single-leg-romanian-deadlift|Single-leg dumbbell Romanian deadlift|Hamstrings|Dumbbells|Intermediate|Glutes,Core
skullcrusher|EZ-bar skull crusher|Triceps|Barbells|Intermediate|
sledpush|Sled push|Full Body|Sled|Intermediate|Quadriceps,Glutes
smithincline|Smith machine incline press|Chest|Smith Machine|Intermediate|Triceps,Shoulders
stairmaster|Stair climber|Quadriceps|Machines|Beginner|Glutes,Calves
steadyrun|Running|Full Body|Bodyweight|Beginner|Quadriceps,Calves
stepup|Dumbbell step-up|Quadriceps|Dumbbells|Intermediate|Glutes
sumodeadlift|Sumo deadlift|Glutes|Barbells|Advanced|Hamstrings,Quadriceps,Back
t-bar-row|T-bar row|Back|Barbells|Intermediate|Biceps
tmwalk|Treadmill walking|Quadriceps|Machines|Beginner|Calves
toe-touch-crunch|Toe-touch crunch|Core|Bodyweight|Beginner|
triceppushdown|Cable triceps pushdown|Triceps|Cables|Beginner|
upright-row|Barbell upright row|Shoulders|Barbells|Intermediate|
v-up|V-up|Core|Bodyweight|Advanced|
wall-sit|Wall sit|Quadriceps|Bodyweight|Beginner|Glutes`;
const review = [
  [
    "HIIT.png",
    "Shows interval running, a training protocol rather than one discrete exercise.",
  ],
  [
    "arnold-press.png",
    "Single overhead-press position does not verify the defining Arnold rotation.",
  ],
  [
    "machine-chest-press.png",
    "Image appears to show a pec-deck fly machine rather than a chest press.",
  ],
  [
    "incline-treadmill-walk.png",
    "Incline is not visually established. Review before assigning the incline variant.",
  ],
  [
    "straight-arm-pulldown.png",
    "Cable position and elbow action are ambiguous; may depict a triceps pushdown.",
  ],
];
const timed = new Set(
  "assault-bike battleropes cycling elliptical farmers-carry hollow-body-hold jumprope mtclimber plank rowing sideplank sledpush stairmaster steadyrun tmwalk wall-sit".split(
    " ",
  ),
);
const catalog = rows.split("\n").map((line) => {
  const [id, name, primary, equipment, difficulty, secondary] = line.split("|");
  return {
    id,
    name,
    primary,
    equipment,
    difficulty,
    secondary: secondary ? secondary.split(",") : [],
    images: [`/exercises/${id}.${id === "pushup" ? "jpg" : "png"}`],
    timed: timed.has(id),
    instructions: [],
    mistakes: [],
    tips: [],
  };
});
// Technique content requires an explicitly reviewed source; unreviewed entries remain empty.
const bench = catalog.find((e) => e.id === "bench");
Object.assign(bench, {
  source:
    "https://www.nasm.org/resource-center/exercise-library/barbell-bench-press",
  instructions: [
    "Lie on a flat bench with feet supported on the floor and eyes below the bar. Use a closed grip slightly wider than shoulder width.",
    "With a spotter, unrack the bar and position it above your chest with your wrists aligned over your forearms.",
    "Lower the bar under control toward the middle of your chest, keeping your shoulders supported on the bench.",
    "Press the bar upward while exhaling. After the final repetition, return it securely to the rack with assistance.",
  ],
  mistakes: [
    "Bouncing the bar off the chest.",
    "Lifting the hips from the bench or losing wrist alignment.",
  ],
  tips: [
    "Choose a load you can control throughout the movement.",
    "Use a spotter and appropriately positioned safety supports.",
  ],
});
for (const exercise of catalog) {
  const cues = guidance[exercise.id];
  if (cues) {
    exercise.instructions = cues.slice(0, 2);
    exercise.mistakes = [cues[2]];
    exercise.tips = [cues[3]];
  }
}
fs.mkdirSync("public/exercises", { recursive: true });
for (const e of catalog)
  for (const path of e.images)
    if (
      !fs.existsSync("public" + path) ||
      fs.statSync("public" + path).size !==
        fs.statSync("images/" + path.split("/").pop()).size ||
      fs.statSync("images/" + path.split("/").pop()).mtimeMs > fs.statSync("public" + path).mtimeMs
    )
      fs.copyFileSync("images/" + path.split("/").pop(), "public" + path);
fs.writeFileSync("lib/exercises.json", JSON.stringify(catalog, null, 2) + "\n");
fs.writeFileSync(
  "lib/exercise-image-review.json",
  JSON.stringify(
    review.map(([file, reason]) => ({ file, reason })),
    null,
    2,
  ) + "\n",
);
const files = fs.readdirSync("images");
const known = new Set([
  ...catalog.map((e) => e.images[0].split("/").pop()),
  ...review.map((r) => r[0]),
]);
if (files.some((f) => !known.has(f))) throw new Error("Unreviewed image found");
console.log(
  `${catalog.length} exercises; ${review.length} images need review; ${files.length} total images accounted for.`,
);
