import test from "node:test";
import assert from "node:assert/strict";
import {
  exerciseImageUrl,
  toLibraryExercise,
} from "../lib/exercise-catalog.ts";

const row = {
  id: "3_4_Sit-Up",
  name: "3/4 Sit-Up",
  primary_muscles: ["abdominals"],
  primary_muscle: "abdominals",
  secondary_muscles: [],
  movement_pattern: null,
  equipment: "body only",
  is_compound: true,
  force: "pull",
  level: "beginner",
  mechanic: "compound",
  category: "strength",
  instructions: ["Lift with control."],
  images: ["3_4_Sit-Up/0.jpg"],
  metadata: null,
  source: "free-exercise-db",
};

test("upstream image paths use the raw exercises folder", () => {
  const exercise = toLibraryExercise(row);
  assert.equal(exercise.id, row.id);
  assert.equal(
    exercise.images[0],
    "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/3_4_Sit-Up/0.jpg",
  );
  assert.equal(exercise.primary, "abdominals");
});

test("missing images have an accessible local fallback", () => {
  assert.deepEqual(toLibraryExercise({ ...row, images: [] }).images, [
    "/exercises/placeholder.svg",
  ]);
});

test("legacy details and local images are preserved", () => {
  const old = toLibraryExercise({
    ...row,
    id: "bench",
    source: "firstrep",
    images: ["/exercises/bench.png"],
    metadata: {
      timed: true,
      tips: ["Keep control."],
      mistakes: [],
      source: "https://example.com",
    },
  });
  assert.equal(old.images[0], "/exercises/bench.png");
  assert.equal(old.timed, true);
  assert.deepEqual(old.tips, ["Keep control."]);
  assert.equal(old.source, "https://example.com");
});

test("unsafe upstream image paths are rejected", () => {
  assert.throws(() => exerciseImageUrl("../private.jpg"));
  assert.throws(() => exerciseImageUrl("https://other.example/img.jpg"));
});
