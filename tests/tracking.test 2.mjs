import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bmi,
  bmiCategory,
  calories,
  csvExport,
  csvImport,
  toGrams,
  toKg,
  validateEntry,
  volume,
} from "../lib/tracking.ts";
const id = "7566a7b1-fac6-4bf4-9fe1-86e03a96f044";
test("BMI and adult boundaries preserve original formulas", () => {
  assert.ok(
    Math.abs(bmi({ id, height_cm: 170, weight_kg: 70 }) - 24.221453287) < 1e-8,
  );
  assert.equal(bmiCategory(18.49), "Underweight");
  assert.equal(bmiCategory(18.5), "Normal weight");
  assert.equal(bmiCategory(25), "Overweight");
  assert.equal(bmiCategory(30), "Obesity");
});
test("weight and portion conversions are consistent", () => {
  assert.equal(toKg(100, "lb"), 45.359237);
  assert.equal(toGrams(1, "lb"), 453.59237);
  assert.ok(Math.abs(toGrams(16, "oz") - toGrams(1, "lb")) < 1e-8);
});
test("derived totals come from inputs only", () => {
  assert.equal(volume({ id, sets: 3, reps: 8, weight_kg: 50 }), 1200);
  assert.equal(calories({ id, protein_g: 20, carbs_g: 30, fat_g: 10 }), 290);
});
test("log validation rejects invalid input", () => {
  for (const weight of [-1, 0, 501, Infinity, NaN])
    assert.throws(() =>
      validateEntry("bmi", {
        id,
        weight_kg: weight,
        height_cm: 170,
        recorded_at: "2026-09-20T12:00:00Z",
      }),
    );
  const workout = {
    id,
    date: "2026-09-20",
    exercise: "Bench",
    sets: 3,
    reps: 8,
    weight_kg: 20,
    rpe: 7,
    notes: "",
  };
  assert.throws(() => validateEntry("workout", { ...workout, sets: 1.5 }));
  assert.throws(() => validateEntry("workout", { ...workout, rpe: 7.2 }));
  assert.throws(() =>
    validateEntry("workout", { ...workout, date: "2026-02-30" }),
  );
  assert.throws(() => validateEntry("workout", { ...workout, exercise: "  " }));
  assert.equal(validateEntry("workout", { ...workout, rpe: 7.5 }).rpe, 7.5);
});
test("CSV roundtrip preserves commas, quotes, Unicode and multiline notes", () => {
  const row = {
    id,
    date: "2026-09-20",
    exercise: 'Row, "supported"',
    sets: 3,
    reps: 8,
    weight_kg: 20,
    rpe: 7.5,
    notes: "Strong\nSecond line — good",
  };
  const [restored] = csvImport("workout", csvExport("workout", [row]));
  const { id: originalId, ...original } = row;
  const { id: restoredId, ...actual } = restored;
  assert.deepEqual(actual, original);
  assert.notEqual(originalId, restoredId);
});
test("CSV accepts original Streamlit exports and derives calories", () => {
  const [row] = csvImport(
    "food",
    "\uFEFFdate,food,protein_g,carbs_g,fat_g\n2026-09-20,Chicken bowl,30,50,10\n",
  );
  assert.equal(calories(row), 410);
});
test("CSV rejects wrong schema, missing numbers, invalid dates and malformed quotes", () => {
  assert.throws(() =>
    csvImport(
      "food",
      "date,food,protein_g,carbs_g,fat_g\n2026-09-20,Apple,,20,0",
    ),
  );
  assert.throws(() =>
    csvImport(
      "food",
      'date,food,protein_g,carbs_g,fat_g\n2026-09-20,"Apple,1,20,0',
    ),
  );
  assert.throws(() =>
    csvImport(
      "food",
      "date,food,protein_g,carbs_g,fat_g\n2026-02-30,Apple,1,20,0",
    ),
  );
  assert.throws(() => csvImport("bmi", "name,value\nBMI,24"));
  assert.deepEqual(
    csvImport("food", "date,food,protein_g,carbs_g,fat_g\n"),
    [],
  );
});
