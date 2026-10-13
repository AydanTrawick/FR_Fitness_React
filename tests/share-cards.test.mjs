import { test } from "node:test";
import assert from "node:assert/strict";
import {
  workoutCardData,
  cardWeight,
  cardDate,
  validPR,
} from "../lib/share-cards.ts";
const row = (
  id,
  exercise,
  sets,
  reps,
  weight,
  date = "2026-10-13",
  extra = {},
) => ({ id, exercise, sets, reps, weight_kg: weight, date, ...extra });
test("workout cards retain changing per-set weights, legacy set counts, and the selected date", () => {
  const data = workoutCardData(
    [
      row("1", "Bench press", 1, 8, 100, undefined, { exercise_id: "bench" }),
      row("2", "Bench Press", 1, 6, 110, undefined, { exercise_id: "bench" }),
      row("3", "Squat", 3, 10, 80),
      row("4", "Deadlift", 1, 1, 200, "2026-10-12"),
    ],
    "2026-10-13",
  );
  assert.equal(data.exercises.length, 2);
  assert.deepEqual(
    data.exercises[0].sets.map((s) => [s.number, s.count, s.reps, s.weightKg]),
    [
      [1, 1, 8, 100],
      [2, 1, 6, 110],
    ],
  );
  assert.deepEqual(data.exercises[1].sets[0], {
    number: 1,
    count: 3,
    reps: 10,
    weightKg: 80,
  });
  assert.equal(data.totalSets, 5);
  assert.equal(data.volumeKg, 3860);
  assert.equal(workoutCardData([], "2026-10-13").totalSets, 0);
});
test("card units and dates do not change with the viewers timezone", () => {
  assert.ok(Math.abs(cardWeight(183.70490985, "lb") - 405) < 0.00001);
  assert.equal(cardWeight(100, "kg"), 100);
  assert.equal(cardDate("2026-10-13"), "TUE OCT 13");
  assert.equal(cardDate("2026-10-13", true), "OCT 13 2026");
});
test("PR cards require real numeric input and only show an improvement over a lower previous weight", () => {
  const pr = {
    date: "2026-10-13",
    exercise: "Bench press",
    reps: 2,
    weight: 405,
    unit: "lb",
  };
  assert.equal(validPR(pr), true);
  assert.equal(validPR({ ...pr, previous: 395 }), true);
  for (const patch of [
    { weight: 0 },
    { reps: 0 },
    { reps: 1.5 },
    { exercise: " " },
    { previous: 410 },
    { previous: NaN },
  ])
    assert.equal(validPR({ ...pr, ...patch }), false);
});
