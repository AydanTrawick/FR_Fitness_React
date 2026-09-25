import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  filterExercises,
  workoutSchema,
  workoutDraftSchema,
} from "../lib/workouts.ts";
const catalog = JSON.parse(
  fs.readFileSync(new URL("../lib/exercises.json", import.meta.url)),
);
test("every uploaded image is mapped or explicitly flagged for review", () => {
  const review = JSON.parse(
    fs.readFileSync(
      new URL("../lib/exercise-image-review.json", import.meta.url),
    ),
  );
  const mapped = catalog.flatMap((e) =>
    e.images.map((p) => p.split("/").pop()),
  );
  const files = fs.readdirSync(new URL("../images", import.meta.url));
  assert.deepEqual(
    [...mapped, ...review.map((r) => r.file)].sort(),
    files.sort(),
  );
  assert.equal(new Set(catalog.map((e) => e.id)).size, catalog.length);
  for (const e of catalog)
    for (const path of e.images)
      assert.ok(fs.existsSync(new URL("../public" + path, import.meta.url)));
});
test("search combines with every filter and sort", () => {
  const result = filterExercises(
    catalog,
    "press",
    "Chest",
    "Barbells",
    "Intermediate",
    "name",
  );
  assert.ok(result.some((e) => e.id === "bench"));
  assert.ok(
    result.every(
      (e) =>
        e.primary === "Chest" &&
        e.equipment === "Barbells" &&
        e.difficulty === "Intermediate",
    ),
  );
  assert.equal(
    filterExercises(catalog, "impossible", "", "", "", "name").length,
    0,
  );
  assert.ok(
    filterExercises(catalog, "", "", "", "", "difficulty")[0].difficulty ===
      "Beginner",
  );
});
const item = {
  exerciseId: "bench",
  sets: 3,
  mode: "reps",
  reps: "8-12",
  duration: 30,
  weight: 40,
  rest: 90,
  notes: "",
};
test("workout validates prescriptions and rejects invalid ranges and empty routines", () => {
  assert.ok(
    workoutSchema.safeParse({ name: "Upper Body Strength", exercises: [item] })
      .success,
  );
  for (const patch of [
    { sets: 0 },
    { reps: "12-8" },
    { reps: "0" },
    { weight: -1 },
    { duration: 0 },
    { rest: -1 },
  ])
    assert.equal(
      workoutSchema.safeParse({
        name: "Test",
        exercises: [{ ...item, ...patch }],
      }).success,
      false,
    );
  assert.equal(
    workoutSchema.safeParse({ name: "Test", exercises: [] }).success,
    false,
  );
  assert.equal(
    workoutSchema.safeParse({ name: " ", exercises: [item] }).success,
    false,
  );
});
test("time based prescriptions and ordered repeated exercises are retained", () => {
  const parsed = workoutSchema.parse({
    name: "Core",
    exercises: [
      { ...item, exerciseId: "plank", mode: "duration", duration: 45 },
      item,
      item,
    ],
  });
  assert.equal(parsed.exercises[0].duration, 45);
  assert.equal(parsed.exercises.length, 3);
});

test("incomplete drafts remain recoverable without accepting them as saved workouts", () => {
  const draft = {
    name: "",
    description: "",
    exercises: [{ ...item, sets: 0, reps: "" }],
  };
  assert.ok(workoutDraftSchema.safeParse(draft).success);
  assert.equal(workoutSchema.safeParse(draft).success, false);
});
