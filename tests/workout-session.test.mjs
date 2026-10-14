import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupSessions,
  liftRecords,
  latestEntry,
  catalogIndex,
  describeLift,
  estimated1RM,
  nextTarget,
  weekDates,
  weeklySessions,
  streakDays,
  completedEntries,
  reconcileFinishedWorkout,
  validLive,
  elapsedWorkoutSeconds,
  setWorkoutPaused,
  exerciseEncouragement,
  sessionNotes,
  readSessionNote,
  humanSessionNotes,
} from "../lib/workout-session.ts";
import { cardWeight, validPR } from "../lib/share-cards.ts";
const catalog = [
  {
    id: "bench",
    name: "Bench press",
    primary_muscle: "chest",
    equipment: "barbell",
  },
  {
    id: "pull",
    name: "Pull-ups",
    primary_muscle: "lats",
    equipment: "body only",
  },
  {
    id: "raise",
    name: "Shoulder raise",
    primary_muscle: "shoulders",
    equipment: "dumbbell",
  },
];
const row = (
  id,
  exercise_id,
  weight,
  reps,
  date = "2026-10-13",
  extra = {},
) => ({
  id,
  exercise_id,
  exercise: catalog.find((l) => l.id === exercise_id).name,
  date,
  sets: 1,
  reps,
  weight_kg: weight,
  rpe: 7,
  notes: "",
  ...extra,
});
const note = (id, startedAt = "2026-10-13T12:00:00Z") => ({
  id,
  name: "Push day",
  unit: "lb",
  startedAt,
});
const info = describeLift(row("1", "bench", 40, 8), catalogIndex(catalog));
const live = () => ({
  id: "session",
  name: "Push day",
  unit: "lb",
  date: "2026-10-13",
  startedAt: "2026-10-13T12:00:00Z",
  current: 0,
  selected: 0,
  restEndsAt: null,
  restLength: 90,
  exercises: [
    {
      ...info,
      rest: 90,
      sets: [
        {
          id: "completed",
          weightKg: 50,
          reps: 8,
          rpe: 8,
          done: true,
          completedAt: "2026-10-13T12:02:00Z",
        },
        { id: "pending", weightKg: 60, reps: 6, rpe: 7, done: false },
      ],
    },
  ],
});
test("sessions merge repeated lifts and retain all legacy and individual sets", () => {
  const rows = [
    row("1", "bench", 40, 10, undefined, { sets: 3 }),
    row("2", "bench", 45, 8),
    row("3", "pull", 10, 10),
    row("old", "bench", 30, 8, "2026-10-12"),
  ];
  const days = groupSessions(rows, catalog);
  assert.equal(days.length, 2);
  assert.equal(days[0].groups.length, 2);
  assert.equal(days[0].sets, 5);
  assert.equal(days[0].reps, 48);
  assert.equal(days[0].volumeKg, 1660);
  assert.equal(days[0].groups[0].rows.length, 2);
  assert.equal(days[0].groups[1].bodyweight, true);
  assert.equal(days[0].groups[1].muscle, "Back");
  assert.equal(cardWeight(days[0].volumeKg, "kg"), 1660);
  assert.ok(Math.abs(cardWeight(days[0].volumeKg, "lb") - 3659.6734) < 0.001);
});
test("baseline is the best first-session set, PRs compare estimated strength across sessions", () => {
  const rows = [
    row("old-low", "bench", 40, 8, "2026-10-12"),
    row("old-best", "bench", 50, 8, "2026-10-12"),
    row("not-pr", "bench", 50, 6),
    row("pr", "bench", 55, 8, "2026-10-14"),
  ];
  const { records, awards } = liftRecords(rows, catalog);
  assert.equal(awards.size, 2);
  assert.equal(records[0].badge, "PR");
  assert.equal(records[0].baseline.id, "old-best");
  assert.equal(records[0].previous.id, "old-best");
  assert.equal(records[0].row.id, "pr");
  assert.equal(records[0].estimate, estimated1RM(55, 8));
});
test("separate manual logs on the same day can beat a baseline", () => {
  const rows = [
    row("a", "bench", 50, 8, undefined, {
      notes: sessionNotes("Good form", note("manual-2026-10-13")),
    }),
    row("b", "bench", 55, 8, undefined, {
      notes: sessionNotes(
        "",
        note("manual-2026-10-13", "2026-10-13T14:00:00Z"),
      ),
    }),
  ];
  assert.equal(liftRecords(rows, catalog).records[0].badge, "PR");
  assert.equal(weeklySessions(rows, "2026-10-13"), 1);
});
test("unweighted bodyweight progression recognizes rep PRs and supports its PR card", () => {
  const record = liftRecords(
    [row("a", "pull", 0, 8, "2026-10-12"), row("b", "pull", 0, 10)],
    catalog,
  ).records[0];
  assert.equal(record.badge, "PR");
  assert.equal(record.estimate, 0);
  assert.equal(
    validPR({
      date: "2026-10-13",
      exercise: "Pull-ups",
      weight: 0,
      reps: 10,
      unit: "lb",
      bodyweight: true,
    }),
    true,
  );
  assert.equal(
    validPR({
      date: "2026-10-13",
      exercise: "Bench press",
      weight: 0,
      reps: 10,
      unit: "lb",
    }),
    false,
  );
});
test("last time uses most recent entry, independent of the strongest entry", () => {
  const rows = [
    row("strong", "bench", 100, 8, "2026-10-12"),
    row("later", "bench", 40, 6, undefined, {
      performed_at: "2026-10-13T14:00:00Z",
    }),
    row("early", "bench", 45, 6, undefined, {
      performed_at: "2026-10-13T12:00:00Z",
    }),
  ];
  assert.equal(latestEntry(rows, info, catalog).id, "later");
});
test("targets suggest five pounds for compound lifts and one rep for light isolation lifts", () => {
  const heavy = liftRecords([row("a", "bench", 50, 8)], catalog).records[0],
    light = liftRecords([row("b", "raise", 10, 8)], catalog).records[0];
  assert.ok(Math.abs(nextTarget(heavy).weightKg - 52.26796185) < 1e-8);
  assert.equal(nextTarget(heavy).reps, 8);
  assert.deepEqual(nextTarget(light), { weightKg: 10, reps: 9 });
});
test("feeling updates preserve human notes and all session identity, without stacking metadata", () => {
  const notes = sessionNotes("Worked carefully", note("live"));
  const updated = sessionNotes(notes, {
    ...readSessionNote(notes),
    feeling: "Solid",
  });
  assert.equal(readSessionNote(updated).feeling, "Solid");
  assert.equal(readSessionNote(updated).id, "live");
  assert.equal(humanSessionNotes(updated), "Worked carefully");
  assert.equal(updated.match(/FirstRep session/g).length, 1);
  assert.equal(readSessionNote("Old notes"), null);
  assert.equal(readSessionNote("\n[FirstRep session:null]"), null);
  assert.equal(
    humanSessionNotes("Text\n[FirstRep session:broken]"),
    "Text\n[FirstRep session:broken]",
  );
  assert.ok(sessionNotes("x".repeat(2000), note("live")).length <= 2000);
});
test("week strip starts Monday, counts separate live sessions, and streak continues from yesterday", () => {
  assert.deepEqual(weekDates("2026-10-13"), [
    "2026-10-12",
    "2026-10-13",
    "2026-10-14",
    "2026-10-15",
    "2026-10-16",
    "2026-10-17",
    "2026-10-18",
  ]);
  const rows = [
    row("a", "bench", 50, 8, "2026-10-12"),
    row("b", "bench", 50, 8, undefined, {
      notes: sessionNotes("", note("live-1")),
    }),
    row("c", "pull", 10, 8, undefined, {
      notes: sessionNotes("", note("live-1")),
    }),
    row("d", "bench", 50, 8, undefined, {
      notes: sessionNotes("", note("live-2")),
    }),
  ];
  assert.equal(weeklySessions(rows, "2026-10-13"), 3);
  assert.equal(streakDays(rows, "2026-10-13"), 2);
  assert.equal(streakDays(rows, "2026-10-14"), 2);
  assert.equal(streakDays(rows, "2026-10-15"), 0);
});
test("finish saves only completed sets with stable IDs, kilograms and session notes", () => {
  const rows = completedEntries(live(), "2026-10-13T12:10:00Z");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "completed");
  assert.equal(rows[0].weight_kg, 50);
  assert.equal(rows[0].sets, 1);
  assert.equal(rows[0].performed_at, "2026-10-13T12:02:00Z");
  assert.equal(readSessionNote(rows[0].notes).unit, "lb");
  assert.equal(readSessionNote(rows[0].notes).endedAt, "2026-10-13T12:10:00Z");
  assert.equal(validLive(live()), true);
});
test("draft restoration safely rejects malformed entries and out-of-range sets", () => {
  for (const draft of [
    null,
    {},
    { ...live(), current: 9 },
    { ...live(), exercises: [null] },
    { ...live(), exercises: [{ ...live().exercises[0], sets: [null] }] },
    {
      ...live(),
      exercises: [
        {
          ...live().exercises[0],
          sets: [{ ...live().exercises[0].sets[0], weightKg: 1001 }],
        },
      ],
    },
  ])
    assert.equal(validLive(draft), false);
});

test("backdated manual batches retain chronological log order even when performed-at ties", () => {
  const rows = [
    row("later", "bench", 60, 8, "2026-10-12", {
      performed_at: "2026-10-12T12:00:00Z",
      notes: sessionNotes(
        "",
        note("manual-2026-10-12", "2026-10-13T14:00:00Z"),
      ),
    }),
    row("earlier", "bench", 50, 8, "2026-10-12", {
      performed_at: "2026-10-12T12:00:00Z",
      notes: sessionNotes(
        "",
        note("manual-2026-10-12", "2026-10-13T13:00:00Z"),
      ),
    }),
  ];
  assert.equal(latestEntry(rows, info, catalog).id, "later");
  assert.equal(liftRecords(rows, catalog).records[0].badge, "PR");
});

test("resuming an already-committed draft reuses authoritative rows without duplicates", () => {
  const draft = live(),
    saved = completedEntries(draft, "2026-10-13T12:10:00Z");
  const stored = {
    ...saved[0],
    notes: sessionNotes(saved[0].notes, {
      ...readSessionNote(saved[0].notes),
      feeling: "Solid",
    }),
  };
  const recovered = reconcileFinishedWorkout(
    draft,
    [stored],
    "2026-10-13T12:15:00Z",
  );
  assert.equal(recovered.additions.length, 0);
  assert.equal(recovered.rows.length, 1);
  assert.equal(readSessionNote(recovered.rows[0].notes).feeling, "Solid");
  assert.equal(recovered.previous.length, 0);
  draft.exercises[0].sets[1].done = true;
  const partial = reconcileFinishedWorkout(
    draft,
    [stored],
    "2026-10-13T12:16:00Z",
  );
  assert.equal(partial.additions.length, 1);
  assert.equal(partial.additions[0].id, "pending");
  assert.equal(partial.rows.length, 2);
  assert.throws(
    () =>
      reconcileFinishedWorkout(
        draft,
        [{ ...stored, notes: "" }],
        "2026-10-13T12:20:00Z",
      ),
    /another saved session/,
  );
});

test("elapsed time excludes multiple pauses and paused drafts restore without advancing", () => {
  const start = Date.parse(live().startedAt),
    original = live();
  assert.equal(elapsedWorkoutSeconds(original, start + 12000), 12);
  const paused = setWorkoutPaused(original, true, start + 12000);
  assert.equal(elapsedWorkoutSeconds(paused, start + 60000), 12);
  const restored = JSON.parse(JSON.stringify(paused));
  assert.ok(validLive(restored));
  assert.equal(elapsedWorkoutSeconds(restored, start + 3600000), 12);
  const resumed = setWorkoutPaused(restored, false, start + 60000);
  assert.equal(elapsedWorkoutSeconds(resumed, start + 65000), 17);
  const again = setWorkoutPaused(resumed, true, start + 70000);
  const active = setWorkoutPaused(again, false, start + 90000);
  assert.equal(elapsedWorkoutSeconds(active, start + 100000), 32);
  assert.equal(active.pausedMs, 68000);
  assert.equal(active.startedAt, original.startedAt);
  assert.equal(setWorkoutPaused(paused, true, start + 15000), paused);
  assert.ok(validLive(original));
  assert.equal(validLive({ ...original, pausedMs: -1 }), false);
  assert.equal(validLive({ ...original, pausedAt: start - 1 }), false);
});
test("encouragement celebrates actual completed exercises at the halfway milestone", () => {
  assert.equal(exerciseEncouragement(0, 8), "Keep going!");
  assert.equal(exerciseEncouragement(1, 8), "Great work!");
  assert.equal(exerciseEncouragement(4, 8), "You're halfway there!");
  assert.equal(exerciseEncouragement(7, 8), "Last exercise. Finish strong!");
});
