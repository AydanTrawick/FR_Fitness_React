import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  durationLabel,
  matchesFilters,
  target,
  weekStart,
  effectiveExercises,
  muscleSets,
  displayWeight,
} from "../lib/programs.ts";
const { programs } = JSON.parse(
  fs.readFileSync(new URL("../lib/content.json", import.meta.url)),
);
test("duration and budget filters treat exact times and 45/60 boundaries consistently", () => {
  assert.equal(durationLabel(programs[0]), "45 min");
  assert.equal(durationLabel(programs[1]), "40 min");
  assert.equal(durationLabel(programs[2]), "60–90 min");
  assert.deepEqual(
    programs
      .filter((p) => matchesFilters(p, "Any", "<45", "Any"))
      .map((p) => p.id),
    ["UpperLower"],
  );
  assert.deepEqual(
    programs
      .filter((p) => matchesFilters(p, "Any", "60+", "Any"))
      .map((p) => p.id),
    ["PPL", "Cardio"],
  );
  assert.ok(matchesFilters(programs[4], "4", "45–60", "Endurance"));
  assert.ok(!matchesFilters(programs[2], "3", "Any", "Muscle"));
});
test("conditioning prescriptions retain time and distance instead of becoming repetitions", () => {
  assert.deepEqual(target("1 min on / 1 min off"), {
    kind: "duration",
    value: 60,
    step: 15,
    label: "Time (s)",
  });
  assert.equal(target("20 sec on / 40 sec off").value, 20);
  assert.equal(target("25-30 min").value, 1500);
  assert.equal(target("500m").kind, "distance");
  assert.equal(target("40 meters").value, 40);
  assert.equal(target("10 each side").kind, "reps");
});
test("swaps preserve prescriptions and update muscle totals without mutating source routines", () => {
  const original = programs[0].schedule[0].exercises[0];
  const swap = effectiveExercises(programs[0], 0, { "0:0": 0 })[0];
  assert.notEqual(swap.name, original.name);
  assert.equal(swap.sets, original.sets);
  assert.equal(swap.reps, original.reps);
  assert.equal(muscleSets([swap, swap])[0][1], 6);
  assert.equal(effectiveExercises(programs[0], 0, { "0:0": 99 })[0], original);
  assert.equal(displayWeight(22.6796185, "lb"), 50);
  assert.equal(weekStart("2026-10-18"), "2026-10-12");
  assert.equal(weekStart("2026-10-19"), "2026-10-19");
});
test("every published program has a complete week and valid focus, cues and rest metadata", () => {
  const ids = new Set(
    JSON.parse(
      fs.readFileSync(new URL("../lib/exercises.json", import.meta.url)),
    ).map((e) => e.id),
  );
  for (const p of programs) {
    assert.equal(p.weekSchedule.length, 7);
    assert.deepEqual(
      p.weekSchedule
        .filter((d) => d.dayIndex !== null)
        .map((d) => d.dayIndex)
        .sort(),
      p.schedule.map((_, i) => i),
    );
    for (const v of Object.values(p.focus))
      assert.ok(Number.isInteger(v) && v >= 1 && v <= 5);
    for (const d of p.schedule)
      for (const e of d.exercises) {
        assert.ok(e.cues.length);
        assert.ok(e.restSeconds >= 0);
        if (e.exerciseId) assert.ok(ids.has(e.exerciseId), e.name);
        for (const a of e.alternatives)
          if (a.exerciseId) assert.ok(ids.has(a.exerciseId), a.name);
      }
  }
});
