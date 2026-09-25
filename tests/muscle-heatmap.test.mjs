import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Model, { MuscleType, anteriorData, posteriorData } from "@plexapro/react-body-highlighter";
import { scoreMuscles, muscleSlugs, colorBucket, toSlugTotals } from "../lib/muscle-heatmap.ts";

test("bench and squat sets receive primary and secondary credit", () => {
  const muscles = scoreMuscles([
    { name: "Barbell Bench Press", sets: 4, primary_muscles: ["chest"], secondary_muscles: ["triceps", "shoulders"] },
    { name: "Barbell Squat", sets: 3, primary_muscles: ["quadriceps"], secondary_muscles: ["glutes", "hamstrings"] },
  ]);
  assert.equal(muscles.chest.sets, 4);
  assert.equal(muscles.triceps.sets, 2);
  assert.equal(muscles.shoulders.sets, 2);
  assert.equal(muscles.quadriceps.sets, 3);
  assert.equal(muscles.glutes.sets, 1.5);
  assert.deepEqual(muscles.chest.exercises, ["Barbell Bench Press"]);
  assert.equal(scoreMuscles([{ name: "Legacy bench", sets: 1, primary_muscles: ["Chest"], secondary_muscles: ["Triceps"] }]).chest.sets, 1);
});

test("all 17 dataset muscles map to installed body slugs", () => {
  const valid = new Set(Object.values(MuscleType));
  const rendered = new Set([...anteriorData, ...posteriorData].map((part) => part.muscle));
  assert.equal(Object.keys(muscleSlugs).length, 17);
  for (const slugs of Object.values(muscleSlugs))
    for (const slug of slugs) {
      assert.ok(valid.has(slug), `${slug} is not a package slug`);
      assert.ok(rendered.has(slug), `${slug} is not rendered on either body`);
    }
});

test("weekly color buckets include the 30-day adjustment", () => {
  assert.equal(colorBucket(0, "7d"), 0);
  assert.equal(colorBucket(4, "7d"), 1);
  assert.equal(colorBucket(10, "7d"), 2);
  assert.equal(colorBucket(20, "7d"), 3);
  assert.equal(colorBucket(21, "7d"), 3);
  assert.equal(colorBucket(40, "30d"), 1);
  assert.equal(colorBucket(45, "30d"), 2);
  assert.equal(colorBucket(90, "30d"), 3);
});

test("lats and middle back add together on upper back", () => {
  const mapped = toSlugTotals({
    lats: { sets: 4, exercises: ["Pull-up"] },
    "middle back": { sets: 3, exercises: ["Row"] },
  });
  assert.equal(mapped["upper-back"].sets, 7);
  assert.deepEqual(mapped["upper-back"].exercises, ["Pull-up", "Row"]);
});

test("body model renders the selected weekly bucket color", () => {
  const color = "#c9e5a6";
  const markup = renderToStaticMarkup(createElement(Model, {
    type: "anterior",
    data: ["chest", "left-chest", "right-chest"].map((muscle) => ({ name: muscle, type: "anterior", muscles: [muscle], color })),
    bodyColor: "#48514b",
  }));
  assert.match(markup, /data-testid="model-anterior"/);
  assert.match(markup, /data-muscle="left-chest"[^>]*fill:#c9e5a6/);
});
