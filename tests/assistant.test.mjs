import { test } from "node:test";
import assert from "node:assert/strict";
import {
  prepareWorkout,
  prepareFood,
  dateInZone,
  chatInput,
} from "../lib/assistant/schema.ts";
import { runToolLoop, assistantTools } from "../lib/assistant/tools.ts";
import {
  validateEntry,
  calories,
  csvExport,
  csvImport,
} from "../lib/tracking.ts";
const context = {
  now: new Date("2026-10-15T02:00:00Z"),
  timezone: "America/New_York",
  unit: "lb",
};
const id = "7566a7b1-fac6-4bf4-9fe1-86e03a96f044";
test("typed reference workout preserves pounds and optional RPE", () => {
  const p = prepareWorkout(
    {
      exercise_name: "Bench press",
      sets: [{ reps: 10, weight: 225, unit: "lb" }],
    },
    context,
  );
  assert.equal(p.date, "2026-10-14");
  assert.equal(p.sets.length, 1);
  assert.equal(p.sets[0].weight, 225);
  assert.equal(p.sets[0].rpe, null);
});
test("protein-only reference preserves all unknown values", () => {
  const p = prepareFood(
    { food_name: "Steak", protein_g: 40, values_source: "user_stated" },
    context,
  );
  assert.equal(p.log_date, "2026-10-14");
  assert.equal(p.protein_g, 40);
  for (const key of ["carbs_g", "fat_g", "calories"])
    assert.equal(p[key], null);
});
test("profile unit default, explicit override and bodyweight", () => {
  assert.equal(
    prepareWorkout(
      { exercise_name: "Bench", sets: [{ reps: 10, weight: 100 }] },
      context,
    ).sets[0].unit,
    "lb",
  );
  assert.equal(
    prepareWorkout(
      { exercise_name: "Bench", sets: [{ reps: 10, weight: 100, unit: "kg" }] },
      context,
    ).sets[0].unit,
    "kg",
  );
  assert.equal(
    prepareWorkout(
      { exercise_name: "Pushup", sets: [{ reps: 10, unit: "bodyweight" }] },
      context,
    ).sets[0].weight,
    null,
  );
});
test("missing facts and range errors reject drafts instead of defaulting", () => {
  for (const set of [
    { reps: 10 },
    { reps: 101, weight: 10 },
    { reps: 10, weight: 1501 },
    { reps: 10, weight: 681, unit: "kg" },
    { reps: 10, weight: 20, unit: "bodyweight" },
    { weight: 10 },
    { reps: 10, weight: 10, rpe: 11 },
  ])
    assert.throws(() =>
      prepareWorkout({ exercise_name: "Bench", sets: [set] }, context),
    );
  assert.throws(() =>
    prepareWorkout(
      { exercise_name: "Bench", sets: [{ reps: 10, weight: 10 }] },
      { ...context, unit: undefined },
    ),
  );
  assert.throws(() =>
    prepareFood(
      { food_name: "Steak", protein_g: 501, values_source: "user_stated" },
      context,
    ),
  );
  assert.throws(() =>
    prepareFood({ food_name: "Steak", values_source: "user_stated" }, context),
  );
});
test("owner is never accepted from a client or model payload", () => {
  assert.throws(() =>
    prepareFood(
      {
        food_name: "Steak",
        protein_g: 40,
        values_source: "user_stated",
        user_id: "someone-else",
      },
      context,
    ),
  );
  assert.throws(() =>
    chatInput.parse({
      prompt: "hello",
      conversationId: id,
      requestId: id,
      user_id: "someone-else",
    }),
  );
});
test("timezone handles late-night day and invalid dates", () => {
  assert.equal(
    dateInZone(new Date("2026-10-15T00:30:00Z"), "America/Los_Angeles"),
    "2026-10-14",
  );
  assert.throws(() =>
    prepareFood(
      {
        food_name: "Steak",
        protein_g: 40,
        values_source: "user_stated",
        log_date: "2026-02-30",
      },
      context,
    ),
  );
});
test("tool loop returns matching result blocks before the final reply", async () => {
  let calls = 0;
  const executed = [];
  const text = await runToolLoop({
    messages: [{ role: "user", content: "Log bench" }],
    call: async (messages) => {
      if (calls++ === 0)
        return {
          content: [
            {
              type: "tool_use",
              id: "tool_1",
              name: "log_workout_set",
              input: {
                exercise_name: "Bench",
                sets: [{ reps: 10, weight: 225, unit: "lb" }],
              },
            },
          ],
        };
      assert.equal(messages.at(-2).role, "assistant");
      assert.equal(messages.at(-1).role, "user");
      assert.equal(messages.at(-1).content[0].tool_use_id, "tool_1");
      assert.equal(
        JSON.parse(messages.at(-1).content[0].content).status,
        "pending",
      );
      return {
        content: [{ type: "text", text: "Review and confirm this draft." }],
      };
    },
    execute: async (name, input) => {
      executed.push(name);
      prepareWorkout(input, context);
      return { status: "pending" };
    },
  });
  assert.equal(text, "Review and confirm this draft.");
  assert.deepEqual(executed, ["log_workout_set"]);
});
test("invalid tool input yields is_error and a follow-up", async () => {
  let calls = 0;
  const text = await runToolLoop({
    messages: [],
    call: async (messages) => {
      if (calls++ === 0)
        return {
          content: [
            { type: "tool_use", id: "bad", name: "log_food", input: {} },
          ],
        };
      assert.equal(messages.at(-1).content[0].is_error, true);
      return {
        content: [{ type: "text", text: "What food and protein amount?" }],
      };
    },
    execute: async (_name, input) => prepareFood(input, context),
  });
  assert.match(text, /What food/);
});
test("tool definitions include all four supported tools and never expose confirm", () => {
  assert.deepEqual(
    assistantTools.map((t) => t.name),
    ["log_workout_set", "log_food", "search_exercises", "get_today_summary"],
  );
});
test("tracker validation and CSV preserve sparse assistant metadata", () => {
  const row = validateEntry("food", {
    id,
    date: "2026-10-14",
    food: "Steak",
    protein_g: 40,
    carbs_g: null,
    fat_g: null,
    calories: null,
    meal: "unspecified",
    source: "text",
    values_source: "user_stated",
  });
  assert.equal(calories(row), null);
  const [copy] = csvImport("food", csvExport("food", [row]));
  assert.equal(copy.carbs_g, null);
  assert.equal(copy.calories, null);
  assert.equal(copy.source, "text");
  assert.equal(copy.values_source, "user_stated");
  const workout = validateEntry("workout", {
    id,
    date: "2026-10-14",
    exercise: "Bench",
    exercise_id: null,
    performed_at: "2026-10-14T20:00:00Z",
    sets: 1,
    reps: 10,
    weight_kg: 102.05828325,
    rpe: null,
    notes: "",
    weight_as_entered: 225,
    weight_unit: "lb",
    source: "text",
  });
  const [restored] = csvImport("workout", csvExport("workout", [workout]));
  assert.equal(restored.rpe, null);
  assert.equal(restored.weight_as_entered, 225);
});
