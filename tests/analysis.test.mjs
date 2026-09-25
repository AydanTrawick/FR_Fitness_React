import test from "node:test";
import assert from "node:assert/strict";
import {
  computeMetrics,
  sessionVolume,
  localDate,
} from "../lib/analysis/metrics.ts";
import { getInsights } from "../lib/analysis/insights.ts";
import { seedHistory } from "../lib/analysis/seed.ts";
const now = new Date("2026-09-22T16:00:00Z");
const metrics = (raw, range = "30d") =>
  computeMetrics(raw, range, "America/New_York", now);
test("empty input keeps missing measurements null", () => {
  const m = metrics(seedHistory(0));
  assert.equal(m.snapshot.sessions, 0);
  assert.equal(m.snapshot.volume, null);
  assert.equal(m.snapshot.duration, null);
  assert.equal(m.snapshot.consistency, null);
  assert.deepEqual(getInsights(m), []);
});
test("single session has real numbers but no strength or bodyweight slope", () => {
  const m = metrics(seedHistory(1));
  assert.equal(m.snapshot.sessions, 1);
  assert.equal(m.snapshot.duration, 45);
  assert.equal(m.strength[0].trend, null);
  assert.equal(m.bodySlope, null);
  assert.equal(m.snapshot.consistency, null);
});
test("warmups never count toward volume or 1RM", () => {
  const raw = seedHistory(1);
  const expected = sessionVolume(raw.sessions[0]);
  raw.sessions[0].sets.push({
    ...raw.sessions[0].sets[0],
    weight: 999,
    warmup: true,
  });
  const m = metrics(raw);
  assert.equal(m.snapshot.volume, expected);
  assert.ok(m.strength.every((e) => e.current < 100));
  raw.sessions[0].sets = raw.sessions[0].sets.map((s) => ({
    ...s,
    warmup: true,
  }));
  const warm = metrics(raw);
  assert.equal(warm.snapshot.volume, null);
  assert.equal(warm.strength.length, 0);
});
test("missing weight is missing, not zero or invented 1RM", () => {
  const raw = seedHistory(1);
  raw.sessions[0].sets = raw.sessions[0].sets.map((s) => ({
    ...s,
    weight: null,
  }));
  const m = metrics(raw);
  assert.equal(m.snapshot.volume, null);
  assert.ok(m.strength.every((e) => e.current === null));
});
test("timezone keeps 11pm Monday on Monday", () => {
  assert.equal(
    localDate("2026-09-22T03:00:00Z", "America/New_York"),
    "2026-09-21",
  );
});
test("range changes snapshot, weekly series, strength and body data", () => {
  const raw = seedHistory();
  const short = metrics(raw, "7d"),
    long = metrics(raw, "90d");
  assert.equal(short.snapshot.sessions, 3);
  assert.equal(long.snapshot.sessions, 30);
  assert.ok(short.weekly.length < long.weekly.length);
  assert.ok(short.strength[0].points.length < long.strength[0].points.length);
  assert.ok(short.body.length < long.body.length);
});
test("median ignores duration outliers and legacy duration stays null", () => {
  const raw = seedHistory(3);
  raw.sessions[2].completedAt = new Date(
    Date.parse(raw.sessions[2].startedAt) + 600 * 60000,
  ).toISOString();
  assert.equal(metrics(raw).snapshot.duration, 45);
  raw.sessions.forEach((s) => (s.legacy = true));
  assert.equal(metrics(raw).snapshot.duration, null);
});
test("full history yields strength trends, schedule, bodyweight and library", () => {
  const m = metrics(seedHistory(), "all");
  assert.equal(m.totalSessions, 60);
  assert.equal(m.strength.length, 6);
  assert.equal(m.snapshot.consistency, 100);
  assert.notEqual(m.bodySlope, null);
  assert.equal(m.library.find((l) => l.id === "unused").unused, true);
  assert.equal(m.previous, null);
});
test("insights are bounded, neutral, and cite numbers; sparse history is gated", () => {
  const m = metrics(seedHistory());
  m.variety = 2;
  m.avgGap = 8;
  m.frequency = 1;
  m.previousFrequency = 4;
  const insights = getInsights(m, now);
  assert.equal(insights.length, 3);
  assert.ok(insights.every((i) => /\d/.test(i.metric) && /\d/.test(i.body)));
  assert.deepEqual(getInsights(metrics(seedHistory(2)), now), []);
});
test("future and incomplete sessions do not count", () => {
  const raw = seedHistory(3);
  raw.sessions[0].completedAt = null;
  raw.sessions[1].startedAt = "2027-01-01T12:00:00Z";
  assert.equal(metrics(raw).snapshot.sessions, 1);
});
