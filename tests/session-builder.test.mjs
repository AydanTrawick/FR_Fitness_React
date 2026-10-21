import test from "node:test";
import assert from "node:assert/strict";
import {
  draftReducer,
  emptyDraft,
  makeExercise,
  coverage,
  stats,
  flags,
  classify,
  matchesGroup,
  draftSchema,
} from "../lib/session/model.ts";
import {
  nextSplit,
  freshGroups,
  weekStreak,
  performances,
  historyPlans,
} from "../lib/session/history.ts";
import { completePlannedSet } from "../lib/session/live.ts";
import { sessionNotes } from "../lib/workout-session.ts";
const lift = (id, primary = "chest", secondary = []) => ({
  id,
  name: id,
  primary_muscle: primary,
  secondary_muscles: secondary,
  equipment: "dumbbell",
});
const e = (id, primary = "chest", secondary = []) =>
  makeExercise(lift(id, primary, secondary));
const plan = (exercises, split = "custom") => ({
  ...emptyDraft(),
  exercises,
  split,
});
test("muscle matching includes secondary muscles and full-body spans, glutes stay distinct", () => {
  assert.equal(
    matchesGroup(lift("press", "chest", ["shoulders", "triceps"]), "Arms"),
    true,
  );
  assert.equal(
    matchesGroup(lift("press", "chest", ["shoulders", "triceps"]), "Full body"),
    true,
  );
  assert.equal(e("hip", "glutes").muscleGroup, "Glutes");
});
test("defaults prioritize history and distinguish compound, core and isolation", () => {
  assert.equal(e("press", "chest", ["triceps"]).targetSets, 4);
  assert.equal(e("crunch", "abdominals").repMin, 12);
  assert.equal(e("curl", "biceps").repMin, 10);
  assert.equal(
    makeExercise(lift("press"), { sets: 2, repMin: 5, repMax: 7, weightKg: 40 })
      .targetSets,
    2,
  );
});
test("draft toggles duplicates, clamps targets and dissolves broken supersets", () => {
  let d = plan([e("a"), e("b"), e("c"), e("d")]);
  d = draftReducer(d, { type: "ADD", exercise: e("a") });
  assert.equal(d.exercises.length, 4);
  d = draftReducer(d, { type: "LINK_SUPERSET", ids: ["a", "b", "c"] });
  assert.equal(d.exercises[0].supersetGroup, "A");
  d = draftReducer(d, { type: "MOVE", from: 1, to: 3 });
  assert.equal(d.exercises[3].supersetGroup, null);
  assert.equal(d.exercises[0].supersetGroup, "A");
  d = draftReducer(d, { type: "REMOVE", id: "a" });
  assert.equal(d.exercises[0].supersetGroup, null);
  d = draftReducer(d, { type: "SET_TARGET", id: "c", sets: 99, repMin: 60 });
  assert.equal(d.exercises[0].targetSets, 10);
  assert.equal(d.exercises[0].repMax, 50);
  d = draftReducer(d, { type: "TOGGLE", exercise: e("c") });
  assert.equal(d.exercises.length, 2);
});
test("selectors count weighted coverage, superset rounds and nonblocking gaps", () => {
  const a = {
      ...e("a", "chest", ["triceps"]),
      targetSets: 3,
      restOverrideSec: 60,
    },
    b = { ...e("b", "shoulders"), targetSets: 3, restOverrideSec: 90 };
  let d = plan([a, b], "push");
  assert.equal(coverage(d.exercises).Arms, 1.5);
  assert.equal(stats(d).minutes, 13);
  d = draftReducer(d, { type: "LINK_SUPERSET", ids: ["a", "b"] });
  assert.equal(stats(d).minutes, 11);
  assert.ok(flags(d).some((f) => f.message.includes("pulling")));
  assert.ok(
    flags(d, { Shoulders: 19 }).some((f) =>
      f.message.includes("consider fewer"),
    ),
  );
});
test("superset live rounds alternate and rest only after the last member", () => {
  const live = {
    current: 0,
    selected: 0,
    restEndsAt: null,
    restLength: 90,
    exercises: ["a", "b"].map((id) => ({
      id,
      supersetGroup: "A",
      rest: id === "a" ? 60 : 120,
      sets: [0, 1].map((i) => ({
        id: id + i,
        done: false,
        reps: 8,
        weightKg: 0,
        rpe: 7,
      })),
    })),
  };
  const a = completePlannedSet(live, 0, 1000);
  assert.equal(a.current, 1);
  assert.equal(a.restEndsAt, null);
  const b = completePlannedSet(a, 0, 2000);
  assert.equal(b.current, 0);
  assert.equal(b.selected, 1);
  assert.equal(b.restEndsAt, 122000);
});
test("rotation skips a fatigued candidate and empty history recommends full body", () => {
  assert.equal(nextSplit([], []), "full");
  const sessions = ["legs", "pull", "push"].map((split) => ({
    plan: plan([], split),
    finishedAt: new Date().toISOString(),
    completed: [],
  }));
  assert.equal(nextSplit(sessions, ["Back", "Arms", "Legs", "Glutes"]), "pull");
  assert.equal(
    classify([e("squat", "quadriceps"), e("bridge", "glutes")]),
    "legs",
  );
});
test("freshness and week streak handle never-trained groups and an empty current week", () => {
  const monday = new Date("2026-10-19T16:00:00Z");
  const sessions = [
    {
      plan: plan([]),
      finishedAt: "2026-10-18T16:00:00Z",
      completed: [{ ...e("press"), targetSets: 4 }],
    },
  ];
  assert.equal(
    freshGroups(sessions, monday.getTime()).includes("Chest"),
    false,
  );
  assert.equal(freshGroups(sessions, monday.getTime()).includes("Back"), true);
  assert.equal(weekStreak(sessions, "America/New_York", monday), 1);
});
test("last performance uses latest finished session, weighted mode and top weight", () => {
  const notes = sessionNotes("", {
    id: "s",
    name: "Push",
    unit: "kg",
    startedAt: "2026-10-18T12:00:00Z",
    endedAt: "2026-10-18T13:00:00Z",
  });
  const rows = [
    {
      id: "1",
      date: "2026-10-18",
      exercise_id: "press",
      exercise: "press",
      sets: 3,
      reps: 8,
      weight_kg: 30,
      notes,
    },
    {
      id: "2",
      date: "2026-10-18",
      exercise_id: "press",
      exercise: "press",
      sets: 1,
      reps: 6,
      weight_kg: 40,
      notes,
    },
  ];
  const p = performances(rows, [lift("press")]).press;
  assert.equal(p.commonReps, 8);
  assert.equal(p.sets, 4);
  assert.equal(p.weightKg, 40);
});
test("plan schema rejects oversized targets and invalid rep ranges", () => {
  assert.equal(
    draftSchema.safeParse(plan([{ ...e("a"), repMin: 20, repMax: 10 }]))
      .success,
    false,
  );
  assert.equal(
    draftSchema.safeParse(
      plan(Array.from({ length: 31 }, (_, i) => e(String(i)))),
    ).success,
    false,
  );
});

test("unlinking one member preserves an adjacent pair, and max-rep edits keep the chosen value", () => {
  let d = plan([e("a"), e("b"), e("c")]);
  d = draftReducer(d, { type: "LINK_SUPERSET", ids: ["a", "b", "c"] });
  d = draftReducer(d, { type: "UNLINK", id: "a" });
  assert.equal(d.exercises[0].supersetGroup, null);
  assert.equal(d.exercises[1].supersetGroup, "A");
  assert.equal(d.exercises[2].supersetGroup, "A");
  d = draftReducer(d, { type: "SET_TARGET", id: "a", repMax: 6 });
  assert.equal(d.exercises[0].repMin, 6);
  assert.equal(d.exercises[0].repMax, 6);
});
test("repeat plans merge legacy aliases of the same exercise", () => {
  const catalog = [{ ...lift("press"), aliases: ["bench"] }];
  const rows = [
    {
      id: "1",
      date: "2026-10-18",
      exercise_id: "bench",
      exercise: "Old press",
      sets: 2,
      reps: 8,
      weight_kg: 20,
    },
    {
      id: "2",
      date: "2026-10-18",
      exercise_id: "press",
      exercise: "press",
      sets: 1,
      reps: 10,
      weight_kg: 25,
    },
  ];
  const [session] = historyPlans(rows, catalog);
  assert.equal(session.plan.exercises.length, 1);
  assert.equal(session.plan.exercises[0].targetSets, 3);
});
