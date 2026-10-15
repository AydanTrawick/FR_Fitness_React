// No Neon connection. Install PGlite in a temporary directory and pass its
// absolute module path through TEST_PGLITE_MODULE (see VOICE_ASSISTANT.md).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  createAction,
  changeAction,
  repeatPayload,
} from "../lib/assistant/actions.ts";
const { PGlite } = await import(
  process.env.TEST_PGLITE_MODULE || "@electric-sql/pglite"
);
const pg = new PGlite();
// Small postgres tagged-query adapter; all queries run on local PostgreSQL.
function query(parts, ...values) {
  const text = parts.reduce(
    (s, p, i) => s + p + (i < values.length ? "$" + (i + 1) : ""),
    "",
  );
  return pg.query(text, values).then((result) => result.rows);
}
// Drizzle replaces the shared postgres client's JSON serializers with identity
// functions. Raw object parameters then fail in postgres before reaching SQL.
// Require pre-serialized JSON so this integration catches that production bug.
query.json = () => {
  throw new TypeError("Shared Drizzle JSON serializer requires strings");
};
let chain = Promise.resolve();
query.begin = (callback) => {
  const run = chain.then(async () => {
    await pg.exec("BEGIN");
    try {
      const result = await callback(query);
      await pg.exec("COMMIT");
      return result;
    } catch (error) {
      await pg.exec("ROLLBACK");
      throw error;
    }
  });
  chain = run.catch(() => {});
  return run;
};
try {
  await pg.exec(
    await readFile(
      new URL("../database/001_trackers.sql", import.meta.url),
      "utf8",
    ),
  );
  await pg.exec(
    "CREATE TABLE exercises(id TEXT PRIMARY KEY,name TEXT NOT NULL); ALTER TABLE firstrep_workout_entries ADD COLUMN exercise_id TEXT REFERENCES exercises(id), ADD COLUMN performed_at TIMESTAMPTZ;",
  );
  await pg.exec(
    await readFile(
      new URL("../database/011_voice_assistant.sql", import.meta.url),
      "utf8",
    ),
  );
  await query`INSERT INTO firstrep_users(id,email,display_name,password_hash,password_salt) VALUES('fixture-owner','owner@example.invalid','Local fixture','unused','unused'),('fixture-other','other@example.invalid','Other fixture','unused','unused')`;
  await query`INSERT INTO exercises(id,name) VALUES('Barbell_Bench_Press_-_Medium_Grip','Bench Press'),('squat','Barbell Squat')`;
  const actor = {
      id: "fixture-owner",
      timezone: "America/New_York",
      weightUnit: "lb",
    },
    chat = randomUUID();
  const workout = {
    exercise_name: "bench press",
    sets: [{ reps: 10, weight: 225, unit: "lb" }],
  };
  const draft = await createAction(
    actor,
    chat,
    "reference-workout",
    "workout_set",
    workout,
    query,
  );
  assert.equal((await query`SELECT * FROM firstrep_workout_entries`).length, 0);
  await assert.rejects(
    () =>
      changeAction(
        { id: "fixture-other" },
        draft.id,
        chat,
        "confirm",
        undefined,
        query,
      ),
    /not found/,
  );
  await assert.rejects(
    () =>
      changeAction(actor, draft.id, randomUUID(), "confirm", undefined, query),
    /not found/,
  );
  const results = await Promise.all([
    changeAction(actor, draft.id, chat, "confirm", draft.payload, query),
    changeAction(actor, draft.id, chat, "confirm", draft.payload, query),
  ]);
  assert.deepEqual(results[0].resultIds, results[1].resultIds);
  const [row] = await query`SELECT * FROM firstrep_workout_entries`;
  assert.equal((await query`SELECT * FROM firstrep_workout_entries`).length, 1);
  assert.equal(row.reps, 10);
  assert.equal(row.sets, 1);
  assert.equal(row.weight_as_entered, 225);
  assert.equal(row.weight_unit, "lb");
  assert.equal(row.rpe, null);
  assert.equal(row.source, "text");
  assert.ok(Math.abs(row.weight_kg - 102.05828325) < 1e-8);
  const food = await createAction(
    actor,
    chat,
    "reference-food",
    "food",
    { food_name: "Steak", protein_g: 40, values_source: "user_stated" },
    query,
  );
  assert.equal((await query`SELECT * FROM firstrep_food_entries`).length, 0);
  await changeAction(actor, food.id, chat, "confirm", food.payload, query);
  const [meal] = await query`SELECT * FROM firstrep_food_entries`;
  assert.equal(meal.food, "Steak");
  assert.equal(meal.protein_g, 40);
  assert.equal(meal.carbs_g, null);
  assert.equal(meal.fat_g, null);
  assert.equal(meal.calories, null);
  const cancel = await createAction(
    actor,
    chat,
    "cancel-food",
    "food",
    { food_name: "Apple", protein_g: 1, values_source: "user_stated" },
    query,
  );
  await changeAction(actor, cancel.id, chat, "cancel", undefined, query);
  assert.equal(
    (await changeAction(actor, cancel.id, chat, "confirm", undefined, query))
      .status,
    "cancelled",
  );
  const expired = await createAction(
    actor,
    chat,
    "expired-food",
    "food",
    { food_name: "Apple", protein_g: 1, values_source: "user_stated" },
    query,
  );
  await query`UPDATE pending_log_actions SET created_at=NOW()-INTERVAL '1 hour',expires_at=NOW()-INTERVAL '1 minute' WHERE id=${expired.id}`;
  assert.equal(
    (await changeAction(actor, expired.id, chat, "confirm", undefined, query))
      .status,
    "expired",
  );
  const multi = await createAction(
    actor,
    chat,
    "three-sets",
    "workout_set",
    {
      exercise_name: "squat",
      sets: Array.from({ length: 3 }, () => ({
        reps: 8,
        weight: 185,
        unit: "lb",
      })),
    },
    query,
  );
  assert.equal(
    (await changeAction(actor, multi.id, chat, "confirm", undefined, query))
      .resultIds.length,
    3,
  );
  const custom = await createAction(
    actor,
    chat,
    "custom",
    "workout_set",
    {
      exercise_name: "My new lift",
      custom: true,
      sets: [{ reps: 8, weight: 10, unit: "lb" }],
    },
    query,
  );
  await changeAction(actor, custom.id, chat, "confirm", undefined, query);
  assert.equal(
    (
      await query`SELECT exercise_id FROM firstrep_workout_entries WHERE exercise='My new lift'`
    )[0].exercise_id,
    null,
  );
  const invalid = await createAction(
    actor,
    chat,
    "rollback",
    "workout_set",
    workout,
    query,
  );
  const before = (await query`SELECT * FROM firstrep_workout_entries`).length;
  await assert.rejects(() =>
    changeAction(
      actor,
      invalid.id,
      chat,
      "confirm",
      { ...invalid.payload, sets: [{ reps: 101, weight: 225, unit: "lb" }] },
      query,
    ),
  );
  assert.equal(
    (await query`SELECT * FROM firstrep_workout_entries`).length,
    before,
  );
  assert.equal(
    (
      await query`SELECT status FROM pending_log_actions WHERE id=${invalid.id}`
    )[0].status,
    "pending",
  );
  const edited = await createAction(
    actor,
    chat,
    "edited",
    "workout_set",
    workout,
    query,
  );
  await changeAction(
    actor,
    edited.id,
    chat,
    "confirm",
    { ...edited.payload, sets: [{ reps: 12, weight: 227.5, unit: "lb" }] },
    query,
  );
  const [editedStored] =
    await query`SELECT payload FROM pending_log_actions WHERE id=${edited.id}`;
  assert.equal(
    repeatPayload("workout_set", editedStored.payload).sets[0].weight,
    227.5,
  );
  assert.equal(
    repeatPayload("workout_set", editedStored.payload).sets[0].reps,
    12,
  );
  const duplicate = await createAction(
    actor,
    chat,
    "reference-food",
    "food",
    { food_name: "Steak", protein_g: 40, values_source: "user_stated" },
    query,
  );
  assert.equal(duplicate.id, food.id);
  const repeated = repeatPayload("workout_set", multi.payload);
  assert.equal(repeated.sets.length, 1);
  assert.equal(repeated.performed_at, undefined);
  const { handleVoiceCommand } =
    await import("../lib/assistant/voice-command.ts");
  const voiceChat = randomUUID();
  const voiceFirst = await createAction(
    actor,
    voiceChat,
    "voice-first",
    "workout_set",
    workout,
    query,
    "voice",
  );
  await new Promise((resolve) => setTimeout(resolve, 5));
  const voiceLatest = await createAction(
    actor,
    voiceChat,
    "voice-latest",
    "food",
    { food_name: "Steak", protein_g: 40, values_source: "user_stated" },
    query,
    "voice",
  );
  await assert.rejects(
    () =>
      changeAction(
        actor,
        voiceFirst.id,
        voiceChat,
        "confirm",
        undefined,
        query,
        true,
      ),
    /most recent/,
  );
  const mismatch = await handleVoiceCommand(
    actor,
    voiceChat,
    "yes",
    voiceFirst.id,
    undefined,
    query,
  );
  assert.match(mismatch.replyText, /most recent/);
  const voiceSaved = await handleVoiceCommand(
    actor,
    voiceChat,
    "yes",
    voiceLatest.id,
    undefined,
    query,
  );
  assert.equal(voiceSaved.actionResult.status, "confirmed");
  assert.match(voiceSaved.replyText, /Only the most recent/);
  const [voiceFood] =
    await query`SELECT source FROM firstrep_food_entries WHERE id=${voiceSaved.actionResult.resultIds[0]}`;
  assert.equal(voiceFood.source, "voice");
  const retryVoice = await handleVoiceCommand(
    actor,
    voiceChat,
    "yes",
    voiceLatest.id,
    undefined,
    query,
  );
  assert.deepEqual(
    retryVoice.actionResult.resultIds,
    voiceSaved.actionResult.resultIds,
  );
  assert.equal(
    (
      await query`SELECT status FROM pending_log_actions WHERE id=${voiceFirst.id}`
    )[0].status,
    "pending",
  );
  const voiceCancelled = await handleVoiceCommand(
    actor,
    voiceChat,
    "cancel",
    voiceFirst.id,
    undefined,
    query,
  );
  assert.equal(voiceCancelled.actionResult.status, "cancelled");
  const noCard = await handleVoiceCommand(
    actor,
    voiceChat,
    "yes",
    undefined,
    undefined,
    query,
  );
  assert.match(noCard.replyText, /no reviewed draft/);
  assert.equal(
    await handleVoiceCommand(
      actor,
      voiceChat,
      "yes add another set",
      voiceFirst.id,
      undefined,
      query,
    ),
    null,
  );
  if (process.env.TEST_REAL_ANTHROPIC === "1") {
    const { runToolLoop, assistantTools } =
      await import("../lib/assistant/tools.ts");
    const { assistantSystem } = await import("../lib/assistant/prompt.ts");
    const { dateInZone } = await import("../lib/assistant/schema.ts");
    const { matchAssistantExercise } =
      await import("../lib/assistant/exercise.ts");
    const cases = [
      [
        "I just did a set of bench press for 10 reps at 225 pounds, can you add that to my workout log?",
        "workout_set",
      ],
      [
        "I just had a steak, add 40 grams of protein to my food log today.",
        "food",
      ],
    ];
    for (const [prompt, kind] of cases) {
      let proposed;
      const reply = await runToolLoop({
        messages: [{ role: "user", content: prompt }],
        call: async (messages) => {
          const response = await fetch(
            "https://api.anthropic.com/v1/messages",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "anthropic-version": "2023-06-01",
                "x-api-key": process.env.ANTHROPIC_API_KEY,
              },
              body: JSON.stringify({
                model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
                max_tokens: 1800,
                system: assistantSystem(
                  dateInZone(new Date(), actor.timezone),
                  actor.timezone,
                  actor.weightUnit,
                  false,
                ),
                tools: assistantTools,
                messages,
              }),
              signal: AbortSignal.timeout(60000),
            },
          );
          if (!response.ok)
            throw new Error("Claude reference test failed: " + response.status);
          return response.json();
        },
        execute: async (name, input) => {
          if (name === "search_exercises")
            return matchAssistantExercise(
              input.name,
              await query`SELECT id,name FROM exercises`,
            );
          if (name === "get_today_summary")
            return { error: "history access is off" };
          if (name === "log_food" || name === "log_workout_set") {
            proposed = await createAction(
              actor,
              chat,
              "real-reference-" + kind,
              name === "log_food" ? "food" : "workout_set",
              input,
              query,
            );
            return {
              draft: proposed,
              message: "Draft created, awaiting confirmation. Nothing saved.",
            };
          }
          throw new Error("Unknown tool");
        },
      });
      assert.equal(proposed.kind, kind);
      if (kind === "food") {
        assert.equal(proposed.payload.protein_g, 40);
        assert.equal(proposed.payload.carbs_g, null);
        assert.equal(proposed.payload.fat_g, null);
        assert.equal(proposed.payload.calories, null);
      } else {
        assert.equal(proposed.payload.sets.length, 1);
        assert.equal(proposed.payload.sets[0].reps, 10);
        assert.equal(proposed.payload.sets[0].weight, 225);
        assert.equal(proposed.payload.sets[0].unit, "lb");
      }
      await changeAction(actor, proposed.id, chat, "confirm", undefined, query);
      console.log(
        "LIVE CLAUDE / LOCAL DATABASE reference passed: " +
          kind +
          "; reply: " +
          reply,
      );
    }
  }
  console.log(
    "ASSISTANT LOCAL POSTGRESQL INTEGRATION PASSED: reference requests, no pre-confirm writes, owner/chat scope, retry/double confirm, cancel, expiry, multiple sets, custom names and rollback. No Neon connection.",
  );
} finally {
  await pg.close();
}
