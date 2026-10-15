import { test } from "node:test";
import assert from "node:assert/strict";
import { dashboardDate, dashboardStats, shiftDate } from "../lib/dashboard.ts";
const workout = (date, sets = 1, weight_kg = 100) => ({
  id: date + sets,
  date,
  sets,
  weight_kg,
  reps: 10,
  exercise: "Bench",
});
test("dashboard respects user timezone at midnight and date arithmetic across DST", () => {
  assert.equal(
    dashboardDate(new Date("2026-10-15T01:00:00Z"), "America/New_York"),
    "2026-10-14",
  );
  assert.equal(shiftDate("2026-03-08", 1), "2026-03-09");
  assert.equal(shiftDate("2026-01-01", -1), "2025-12-31");
});
test("daily and weekly metrics merge repeat sets but count distinct training days, exclude future logs", () => {
  const stats = dashboardStats(
    {
      bmi: [],
      workout: [
        workout("2026-10-13", 2),
        workout("2026-10-14", 3),
        workout("2026-10-14", 2),
        workout("2026-10-16", 100),
      ],
      food: [
        { id: "1", date: "2026-10-13" },
        { id: "2", date: "2026-10-13" },
        { id: "3", date: "2026-10-16" },
      ],
    },
    "2026-10-14",
  );
  assert.equal(stats.weekTraining, 2);
  assert.equal(stats.fuelDays, 1);
  assert.equal(stats.streak, 2);
  assert.equal(stats.sets, 5);
  assert.equal(stats.totalSets, 7);
  assert.equal(stats.volume, 5000);
  assert.equal(stats.weekMaxVolume, 5000);
  assert.equal(stats.allMaxVolume, 5000);
  assert.equal(stats.days.length, 7);
  assert.equal(stats.days.at(-1).volume, 5000);
  assert.deepEqual(stats.week, [
    "2026-10-12",
    "2026-10-13",
    "2026-10-14",
    "2026-10-15",
    "2026-10-16",
    "2026-10-17",
    "2026-10-18",
  ]);
});
test("streak carries yesterday until today is logged and resets after a missed day", () => {
  const logs = {
    bmi: [],
    food: [],
    workout: [workout("2026-10-12"), workout("2026-10-13")],
  };
  assert.equal(dashboardStats(logs, "2026-10-14").streak, 2);
  assert.equal(dashboardStats(logs, "2026-10-15").streak, 0);
  const empty = dashboardStats(
    { bmi: [], food: [], workout: [] },
    "2026-10-14",
  );
  assert.equal(empty.allMaxVolume, 0);
  assert.equal(empty.totalSets, 0);
  assert.equal(empty.streak, 0);
});
