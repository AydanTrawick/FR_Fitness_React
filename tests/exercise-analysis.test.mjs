import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalCatalog,
  targetMuscles,
  exercisePattern,
} from "../lib/exercise-taxonomy.ts";
import {
  activityIndex,
  analysisSet,
  entrySessions,
} from "../lib/analysis/activity.ts";
import {
  completedEntries,
  validLive,
  readSessionNote,
} from "../lib/workout-session.ts";
import { computeMetrics } from "../lib/analysis/metrics.ts";
const upstream = {
  id: "Barbell_Bench_Press_-_Medium_Grip",
  name: "Barbell Bench Press - Medium Grip",
  primary_muscle: "chest",
  secondary_muscles: ["shoulders", "triceps"],
  force: "push",
  source: "free-exercise-db",
};
const legacy = {
  id: "bench",
  name: "Barbell bench press",
  primary_muscle: "Chest",
  source: "firstrep",
};
test("upstream entries replace duplicates and retain old IDs as aliases", () => {
  const catalog = canonicalCatalog([
    legacy,
    upstream,
    {
      id: "unique",
      name: "Unique exercise",
      primary_muscle: "Core",
      source: "firstrep",
    },
  ]);
  assert.equal(catalog.length, 2);
  assert.deepEqual(catalog[0].aliases, ["bench"]);
  assert.equal(catalog[1].primary_muscle, "abdominals");
  const set = analysisSet(
    { exercise_id: "bench", sets: 3, reps: 8, weight_kg: 50 },
    activityIndex(catalog),
  );
  assert.equal(set.primary, "chest");
  assert.equal(set.pattern, "push");
});
test("taxonomy prioritizes movement over upstream force", () => {
  for (const [name, primary_muscle, force, expected] of [
    ["Romanian Deadlift", "hamstrings", "pull", "hinge"],
    ["Barbell Squat", "quadriceps", "push", "squat"],
    ["Crunch", "abdominals", "pull", "core"],
    ["Dumbbell Bench Press", "chest", "push", "push"],
    ["Cable Row", "middle back", "pull", "pull"],
  ])
    assert.equal(
      exercisePattern({ id: name, name, primary_muscle, force }),
      expected,
    );
});
const live = {
  id: "session-a",
  name: "Custom workout",
  date: "2026-10-19",
  unit: "kg",
  startedAt: "2026-10-19T14:00:00Z",
  pausedMs: 300000,
  current: 0,
  selected: 0,
  restEndsAt: null,
  restLength: 90,
  exercises: [
    {
      id: null,
      key: "custom-a",
      name: "My machine press",
      muscle: "Chest",
      targetMuscle: "chest",
      movementPattern: "push",
      bodyweight: false,
      rest: 90,
      sets: [
        { id: "set-a", weightKg: 40, reps: 10, rpe: 7, done: true },
        { id: "set-b", weightKg: 40, reps: 8, rpe: 7, done: true },
      ],
    },
  ],
};
test("custom workouts restore and persist targets and active duration", () => {
  assert.equal(validLive(live), true);
  const rows = completedEntries(live, "2026-10-19T15:00:00Z");
  assert.equal(readSessionNote(rows[0].notes).durationSeconds, 3300);
  const sessions = entrySessions(rows, activityIndex([upstream]));
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].sets[0].primary, "chest");
  const metrics = computeMetrics(
    { sessions, schedule: [], body: [], library: [], errors: [] },
    "30d",
    "America/New_York",
    new Date("2026-10-19T18:00:00Z"),
  );
  assert.equal(metrics.snapshot.duration, 55);
  assert.deepEqual(
    metrics.durationByWeekday.find((d) => d.day === "Monday"),
    { day: "Monday", minutes: 55, sessions: 1 },
  );
  assert.equal(metrics.patterns.find((p) => p.name === "push").value, 100);
  assert.equal(
    metrics.muscles.some((m) => m.name === "Unclassified"),
    false,
  );
  assert.equal(targetMuscles.includes("chest"), true);
});
test("separate live workouts on one day count separately; untimed history has no invented duration", () => {
  const rows = [
    ...completedEntries(live, "2026-10-19T15:00:00Z"),
    ...completedEntries({ ...live, id: "session-b" }, "2026-10-19T16:00:00Z"),
    { date: live.date, exercise: "Old lift", sets: 1, reps: 8, weight_kg: 20 },
  ];
  const sessions = entrySessions(rows, activityIndex([]));
  assert.equal(sessions.length, 3);
  assert.equal(sessions.filter((s) => s.legacy).length, 1);
});

test("bodyweight push exercises contribute to muscle and movement balance", () => {
  const session = {
    id: "bodyweight",
    startedAt: "2026-10-19T14:00:00Z",
    completedAt: "2026-10-19T15:00:00Z",
    sets: [
      {
        exerciseId: "Pushups",
        name: "Pushups",
        primary: "chest",
        secondary: ["triceps"],
        pattern: "push",
        reps: 10,
        weight: 0,
        warmup: false,
        count: 3,
      },
    ],
  };
  const m = computeMetrics(
    { sessions: [session], schedule: [], body: [], library: [], errors: [] },
    "30d",
    "UTC",
    new Date("2026-10-19T18:00:00Z"),
  );
  assert.equal(m.patterns.find((p) => p.name === "push").value, 100);
  assert.ok(m.muscles.find((p) => p.name === "chest").value > 0);
  assert.equal(m.snapshot.volume, 0);
});

test("air bike cardio stays distinct from the upstream bicycle crunch named Air Bike", () => {
  const catalog = canonicalCatalog([
    {
      id: "Air_Bike",
      name: "Air Bike",
      primary_muscle: "abdominals",
      source: "free-exercise-db",
    },
    {
      id: "assault-bike",
      name: "Air bike",
      primary_muscle: "Full Body",
      source: "firstrep",
    },
    {
      id: "bicyclecrunch",
      name: "Bicycle crunch",
      primary_muscle: "Core",
      source: "firstrep",
    },
  ]);
  assert.equal(catalog.length, 2);
  assert.deepEqual(catalog[0].aliases, ["bicyclecrunch"]);
  assert.equal(catalog[1].primary_muscle, "quadriceps");
});
