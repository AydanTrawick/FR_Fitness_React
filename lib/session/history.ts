import {
  entrySession,
  describeLift,
  readSessionNote,
  catalogIndex,
  type CatalogLift,
} from "../workout-session.ts";
import type { Entry } from "../tracking.ts";
import {
  makeExercise,
  emptyDraft,
  coverage,
  classify,
  type SessionDraft,
  type Performance,
} from "./model.ts";
import {
  GROUPS,
  SESSION,
  SPLIT_GROUPS,
  SPLIT_NAMES,
  type Split,
  type MuscleGroup,
} from "./config.ts";
export type FinishedPlan = {
  id: string;
  rows: Entry[];
  plan: SessionDraft;
  finishedAt: string;
  completed: SessionDraft["exercises"];
};
export function historyPlans(
  rows: Entry[],
  catalog: CatalogLift[],
): FinishedPlan[] {
  const index = catalogIndex(catalog),
    sessions = new Map<string, Entry[]>();
  for (const r of rows) {
    const key = entrySession(r);
    sessions.set(key, [...(sessions.get(key) ?? []), r]);
  }
  return [...sessions.values()]
    .map((list) => {
      const byLift = new Map<string, Entry[]>();
      for (const r of list) {
        const id = describeLift(r, index).key;
        byLift.set(id, [...(byLift.get(id) ?? []), r]);
      }
      const exercises = [...byLift].map(([id, items]) => {
        const row = items[0],
          lift =
            index.get(id) ??
            catalog.find(
              (e) =>
                e.name.toLowerCase() === String(row.exercise).toLowerCase(),
            );
        const base = lift
          ? makeExercise(lift)
          : {
              ...makeExercise({
                id: "custom:" + id,
                name: String(row.exercise),
                primary_muscle: readSessionNote(row.notes)?.targetMuscle,
              }),
              custom: true,
              targetMuscle: readSessionNote(row.notes)?.targetMuscle,
            };
        return {
          ...base,
          targetSets: items.reduce((n, r) => n + Number(r.sets), 0),
          repMin: Math.min(...items.map((r) => Number(r.reps))),
          repMax: Math.max(...items.map((r) => Number(r.reps))),
          weightKg: Math.max(...items.map((r) => Number(r.weight_kg))),
        };
      });
      const note = readSessionNote(list[0].notes),
        at =
          note?.endedAt ??
          String(list.at(-1)?.performed_at ?? list[0].date + "T12:00:00Z");
      return {
        id: entrySession(list[0]),
        rows: list,
        plan: {
          ...emptyDraft(),
          name: note?.name ?? "Repeat workout",
          split: classify(exercises),
          source: "repeat" as const,
          exercises: exercises.map((e) => ({
            ...e,
            targetSets: Math.min(10, e.targetSets),
            repMin: Math.min(50, e.repMin),
            repMax: Math.min(50, e.repMax),
          })),
        },
        finishedAt: at,
        completed: exercises,
      };
    })
    .sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt));
}
export function performances(
  rows: Entry[],
  catalog: CatalogLift[],
): Record<string, Performance> {
  const result: Record<string, Performance> = {};
  for (const session of historyPlans(rows, catalog))
    for (const e of session.completed)
      if (!result[e.exerciseId]) {
        const matching = session.rows.filter(
          (r) => r.exercise_id === e.exerciseId || r.exercise === e.name,
        );
        const reps = new Map<number, number>();
        for (const r of matching)
          reps.set(
            Number(r.reps),
            (reps.get(Number(r.reps)) ?? 0) + Number(r.sets),
          );
        result[e.exerciseId] = {
          sets: e.targetSets,
          repMin: e.repMin,
          repMax: e.repMax,
          commonReps: [...reps].sort((a, b) => b[1] - a[1])[0]?.[0] ?? e.repMin,
          weightKg: e.weightKg,
          at: session.finishedAt,
        };
      }
  return result;
}
export function weeklyCoverage(sessions: FinishedPlan[], now = Date.now()) {
  return coverage(
    sessions
      .filter(
        (s) => now - Date.parse(s.finishedAt) <= SESSION.weeklyDays * 86400000,
      )
      .flatMap((s) => s.completed),
  );
}
export function freshGroups(sessions: FinishedPlan[], now = Date.now()) {
  return GROUPS.filter(
    (g) =>
      g !== "Full body" &&
      !sessions.some(
        (s) =>
          now - Date.parse(s.finishedAt) < SESSION.freshHours * 3600000 &&
          coverage(s.completed)[g] >= SESSION.freshSets,
      ),
  );
}
export function nextSplit(
  sessions: FinishedPlan[],
  fresh: MuscleGroup[],
): Split {
  const recent = sessions.filter((s) => s.plan.split !== "custom").slice(0, 10);
  if (!sessions.length) return "full";
  if (recent.length < 3) {
    return (["push", "pull", "legs"] as Split[]).sort((a, b) => {
      const date = (s: Split) =>
        Date.parse(
          recent.find((x) => x.plan.split === s)?.finishedAt ?? "1970-01-01",
        );
      return date(a) - date(b);
    })[0];
  }
  const rotation = [...new Set(recent.map((s) => s.plan.split))].reverse();
  const index = rotation.indexOf(recent[0].plan.split);
  const candidates = rotation.map(
    (_, i) => rotation[(index + i + 1) % rotation.length],
  );
  return (
    candidates.find((s) => SPLIT_GROUPS[s].every((g) => fresh.includes(g))) ??
    candidates[0]
  );
}
export function defaultPlan(
  split: Split,
  catalog: CatalogLift[],
): SessionDraft {
  const ids = SESSION.templates[split === "custom" ? "full" : split];
  const chosen: CatalogLift[] = [];
  for (const id of ids) {
    const e = catalog.find((e) => e.id === id);
    if (e) chosen.push(e);
  }
  for (const e of catalog) {
    if (chosen.length >= 5) break;
    if (
      SPLIT_GROUPS[split].includes(makeExercise(e).muscleGroup) &&
      !chosen.some((x) => x.id === e.id)
    )
      chosen.push(e);
  }
  return {
    ...emptyDraft(),
    name: `${SPLIT_NAMES[split]} Day`,
    split,
    source: "recommended",
    exercises: chosen.map((e) => makeExercise(e)),
  };
}
export function weekStreak(
  sessions: FinishedPlan[],
  timezone = "America/New_York",
  now = new Date(),
) {
  const key = (date: Date) => {
    const local = new Date(
      date.toLocaleDateString("en-CA", { timeZone: timezone }) + "T12:00:00Z",
    );
    local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
    return local.toISOString().slice(0, 10);
  };
  const weeks = new Set(sessions.map((s) => key(new Date(s.finishedAt))));
  const monday = new Date(key(now) + "T12:00:00Z");
  if (!weeks.has(key(monday))) monday.setUTCDate(monday.getUTCDate() - 7);
  let n = 0;
  while (weeks.has(monday.toISOString().slice(0, 10))) {
    n++;
    monday.setUTCDate(monday.getUTCDate() - 7);
  }
  return n;
}
