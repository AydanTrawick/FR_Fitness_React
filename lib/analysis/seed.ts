import type { RawData, Pattern } from "./types.ts";
// Deterministic fixtures, never inserted into a real account.
export function seedHistory(
  count = 60,
  now = new Date("2026-09-22T16:00:00Z"),
): RawData {
  const exercises = [
    ["bench", "Barbell bench press", "Chest", "push"],
    ["dbrow", "Single-arm dumbbell row", "Back", "pull"],
    ["rdl", "Barbell Romanian deadlift", "Hamstrings", "hinge"],
    ["bbsquat", "Barbell back squat", "Quads", "squat"],
    ["farmers-carry", "Kettlebell farmer carry", "Forearms", "carry"],
    ["cablewoodchop", "Cable woodchop", "Abs", "core"],
  ];
  const raw: RawData = {
    sessions: [],
    body: [],
    schedule: [],
    library: [],
    errors: [],
  };
  for (let i = 0; i < count; i++) {
    const start = new Date(now.getTime() - (count - i - 1) * 3 * 86400000);
    const id = `session-${i}`;
    raw.sessions.push({
      id,
      startedAt: start.toISOString(),
      completedAt: new Date(start.getTime() + 45 * 60000).toISOString(),
      planId: i % 3 === 0 ? "saved-1" : null,
      sets: exercises.flatMap(([exerciseId, name, primary, pattern], j) => [
        {
          exerciseId,
          name,
          primary,
          secondary: [],
          pattern: pattern as Pattern,
          reps: 10,
          weight: 20 + j * 5 + i * 0.25,
          warmup: false,
          count: 3,
        },
        {
          exerciseId,
          name,
          primary,
          secondary: [],
          pattern: pattern as Pattern,
          reps: 10,
          weight: 10,
          warmup: true,
          count: 1,
        },
      ]),
    });
    raw.schedule.push({ date: start.toISOString(), sessionId: id });
    raw.body.push({
      date: start.toISOString(),
      weight: 75 + Math.sin(i / 4) * 0.4,
    });
  }
  raw.library = [
    {
      id: "bench",
      name: "Barbell bench press",
      kind: "exercise",
      savedAt: null,
    },
    {
      id: "saved-1",
      name: "Full body",
      kind: "workout",
      savedAt: new Date(now.getTime() - 180 * 86400000).toISOString(),
    },
    {
      id: "unused",
      name: "Weekend strength",
      kind: "workout",
      savedAt: new Date(now.getTime() - 20 * 86400000).toISOString(),
    },
  ];
  return raw;
}
