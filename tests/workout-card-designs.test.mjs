import test from "node:test";
import assert from "node:assert/strict";
import { renderWorkoutDesign } from "../lib/workout-card-designs.ts";
import { workoutCardData } from "../lib/share-cards.ts";
function canvasRecorder() {
  const labels = [];
  const context = new Proxy(
    {
      font: "20px monospace",
      measureText(value) {
        return {
          width:
            value.length *
            parseFloat(this.font.match(/(\d+)px/)?.[1] || "20") *
            0.48,
        };
      },
      fillText(value) {
        labels.push(value);
      },
    },
    {
      get(target, key) {
        return key in target ? target[key] : () => {};
      },
    },
  );
  return { labels, getContext: () => context };
}
const data = (weights, name = "TEST LIFT") =>
  workoutCardData(
    weights.map((weight_kg, i) => ({
      id: String(i),
      date: "2026-10-17",
      exercise: name,
      sets: 1,
      reps: 8,
      weight_kg,
      performed_at: String(i).padStart(4, "0"),
    })),
    "2026-10-17",
  );
for (const style of ["volume", "ladder", "receipt", "facts"]) {
  test(`${style} renders all set details across pages without inventing positive jumps`, () => {
    const c = canvasRecorder(),
      workout = data(Array(70).fill(50));
    const pages = renderWorkoutDesign(c, workout, "Workout", "kg", 0, style);
    assert.ok(pages >= 1);
    assert.equal(
      c.labels.some((s) => /biggest jump|\+\d.*%/i.test(s)),
      false,
    );
    if (style === "receipt" || style === "ladder") assert.ok(pages > 1);
    c.labels.length = 0;
    for (let i = 0; i < pages; i++)
      renderWorkoutDesign(c, workout, "Workout", "lb", i, style);
    assert.ok(c.labels.some((s) => /TEST LIFT/.test(s)));
    if (style === "ladder")
      assert.equal(c.labels.filter((s) => s === "8 reps").length, 70);
    if (style === "receipt")
      assert.equal(c.labels.join(" ").match(/8×110\.23/g)?.length, 70);
  });
}
test("jump badges consider only lifts displayed on the current card", () => {
  const rows = Array.from({ length: 6 }, (_, exercise) =>
    [50, exercise === 5 ? 100 : 50].map((weight_kg, i) => ({
      id: `${exercise}-${i}`,
      date: "2026-10-17",
      exercise: `Lift ${exercise}`,
      sets: 1,
      reps: 8,
      weight_kg,
      performed_at: `${exercise}-${i}`,
    })),
  ).flat();
  const workout = workoutCardData(rows, "2026-10-17");
  for (const style of ["ladder", "facts"]) {
    const c = canvasRecorder();
    const total = renderWorkoutDesign(c, workout, "Workout", "kg", 0, style);
    const firstPageHasJumpLift = c.labels.includes("LIFT 5");
    assert.equal(
      c.labels.some((s) => /biggest jump/i.test(s)),
      firstPageHasJumpLift,
    );
    c.labels.length = 0;
    for (let page = 0; page < total; page++)
      renderWorkoutDesign(c, workout, "Workout", "kg", page, style);
    assert.ok(c.labels.some((s) => /biggest jump/i.test(s)));
  }
});

test("zero external load has no invented volume share or increase", () => {
  const workout = data([0, 0], "PUSHUPS");
  const volume = canvasRecorder();
  renderWorkoutDesign(volume, workout, "Bodyweight", "kg", 0, "volume");
  assert.ok(volume.labels.includes("NO ADDED WEIGHT RECORDED"));
  const facts = canvasRecorder();
  renderWorkoutDesign(facts, workout, "Bodyweight", "kg", 0, "facts");
  assert.ok(facts.labels.includes("—"));
  assert.equal(
    facts.labels.some((s) => /biggest jump/i.test(s)),
    false,
  );
});
