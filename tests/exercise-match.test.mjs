import assert from "node:assert/strict";
import test from "node:test";
import { matchExercise } from "../lib/exercise-match.ts";
import { isWorkoutLogRequest } from "../lib/workout-intent.ts";

const catalog = [
  { id: "Barbell_Bench_Press_-_Medium_Grip", name: "Barbell Bench Press - Medium Grip" },
  { id: "bench", name: "Barbell bench press" },
  { id: "Barbell_Squat", name: "Barbell Squat" },
];

test("spoken bench resolves to the seeded upstream exercise ID", () => {
  assert.equal(matchExercise("bench", catalog).match?.id, "Barbell_Bench_Press_-_Medium_Grip");
  assert.equal(matchExercise("Barbell Bench Press", catalog).match?.id, "Barbell_Bench_Press_-_Medium_Grip");
});

test("unknown exercise is not silently saved", () => {
  const result = matchExercise("incline bench", catalog);
  assert.equal(result.match, null);
  assert.ok(result.candidates.length > 0);
});

test("spoken shorthand is recognized as a logging request", () => {
  assert.equal(isWorkoutLogRequest("3 sets of bench"), true);
  assert.equal(isWorkoutLogRequest("Log 2 sets of Barbell Bench Press for a weight of 225 today"), true);
  assert.equal(isWorkoutLogRequest("What is a bench press?"), false);
});
