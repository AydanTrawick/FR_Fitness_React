// Actual provider smoke test, with no database imports or log writes.
import { streamSpeech, transcribeAudio } from "../lib/assistant/speech.ts";
import { assistantTools, runToolLoop } from "../lib/assistant/tools.ts";
import { assistantSystem } from "../lib/assistant/prompt.ts";
import {
  prepareFood,
  prepareWorkout,
  dateInZone,
} from "../lib/assistant/schema.ts";
import { matchAssistantExercise } from "../lib/assistant/exercise.ts";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const catalog = JSON.parse(
  await readFile(new URL("../lib/exercises.json", import.meta.url), "utf8"),
);
const exercises = (
  Array.isArray(catalog) ? catalog : (catalog.exercises ?? [])
).map((item) => ({ id: item.id, name: item.name }));
const ctx = { now: new Date(), timezone: "America/New_York", unit: "lb" };
const references = [
  [
    "I just did a set of bench press for ten reps at two hundred twenty five pounds. Add that to my workout log.",
    "workout_set",
  ],
  [
    "I just had a steak. Add forty grams of protein to my food log today.",
    "food",
  ],
];
for (const [phrase, kind] of references) {
  const spoken = await streamSpeech(phrase);
  const bytes = await spoken.arrayBuffer();
  const form = new FormData();
  form.set("audio", new File([bytes], "reference.mp3", { type: "audio/mpeg" }));
  form.set("durationMs", "10000");
  const released = performance.now(),
    { text } = await transcribeAudio(form);
  let draft;
  const reply = await runToolLoop({
    messages: [{ role: "user", content: text }],
    call: async (messages) => {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
          max_tokens: 1800,
          system:
            assistantSystem(
              dateInZone(ctx.now, ctx.timezone),
              ctx.timezone,
              ctx.unit,
              false,
            ) +
            " Reply in one or two short plain sentences for voice. For clear exercise names call log_workout_set directly; the server resolves them. No markdown or lists.",
          tools: assistantTools,
          messages,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok)
        throw new Error("Claude check failed: " + response.status);
      return response.json();
    },
    execute: async (name, input) => {
      if (name === "search_exercises")
        return matchAssistantExercise(input.name, exercises);
      if (name === "get_today_summary")
        return { error: "history access is off" };
      draft =
        name === "log_food"
          ? prepareFood(input, ctx)
          : prepareWorkout(input, ctx);
      return {
        status: "pending",
        draft,
        message: "Draft created, awaiting user confirmation. Nothing saved.",
      };
    },
  });
  if (kind === "food") {
    assert.equal(draft.protein_g, 40);
    assert.equal(draft.carbs_g, null);
    assert.equal(draft.fat_g, null);
    assert.equal(draft.calories, null);
  } else {
    assert.equal(draft.sets.length, 1);
    assert.equal(draft.sets[0].reps, 10);
    assert.equal(draft.sets[0].weight, 225);
    assert.equal(draft.sets[0].unit, "lb");
  }
  const audio = await streamSpeech(reply);
  const reader = audio.body.getReader();
  await reader.read();
  const firstAudioMs = Math.round(performance.now() - released);
  await reader.cancel();
  console.log(
    JSON.stringify({
      kind,
      transcript: text,
      reply,
      firstAudioMs,
      validated: true,
      noDatabaseWrites: true,
    }),
  );
}
