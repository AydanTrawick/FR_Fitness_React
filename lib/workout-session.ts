import type { Entry } from "./tracking";
import type { CardUnit } from "./share-cards";
export type Muscle =
  "Chest" | "Back" | "Shoulders" | "Arms" | "Legs" | "Core" | "Other";
export const muscleColors: Record<Muscle, string> = {
  Chest: "#5b8cff",
  Back: "#7c8dff",
  Shoulders: "#ff9b50",
  Arms: "#60cabb",
  Legs: "#ef829c",
  Core: "#bd91ed",
  Other: "#9a9a9f",
};
export const feelings = ["Rough", "Okay", "Solid", "Strong", "Peak"] as const;
export type Feeling = (typeof feelings)[number];
export type SessionNote = {
  id: string;
  name: string;
  unit: CardUnit;
  startedAt: string;
  endedAt?: string;
  feeling?: Feeling;
};
const marker = "\n[FirstRep session:";
export function readSessionNote(notes: unknown): SessionNote | null {
  if (typeof notes !== "string") return null;
  const at = notes.lastIndexOf(marker);
  if (at < 0 || !notes.endsWith("]")) return null;
  try {
    const data = JSON.parse(notes.slice(at + marker.length, -1));
    if (
      typeof data.id !== "string" ||
      data.id.length > 100 ||
      typeof data.name !== "string" ||
      data.name.length > 120 ||
      !["lb", "kg"].includes(data.unit) ||
      !Number.isFinite(Date.parse(data.startedAt))
    )
      return null;
    return {
      id: data.id,
      name: data.name,
      unit: data.unit,
      startedAt: data.startedAt,
      ...(data.endedAt && Number.isFinite(Date.parse(data.endedAt))
        ? { endedAt: data.endedAt }
        : {}),
      ...(feelings.includes(data.feeling) ? { feeling: data.feeling } : {}),
    };
  } catch {
    return null;
  }
}
export function humanSessionNotes(notes: unknown) {
  const source = typeof notes === "string" ? notes : "";
  return readSessionNote(source)
    ? source.slice(0, source.lastIndexOf(marker))
    : source;
}
export function sessionNotes(notes: unknown, data: SessionNote) {
  const source = typeof notes === "string" ? notes : "";
  const text = humanSessionNotes(source);
  const suffix = marker + JSON.stringify(data) + "]";
  return text.slice(0, 2000 - suffix.length) + suffix;
}
export type CatalogLift = {
  id: string;
  name: string;
  primary_muscle?: string | null;
  equipment?: string | null;
  category?: string | null;
  metadata?: { timed?: boolean } | null;
};
export type LiftInfo = {
  key: string;
  id: string | null;
  name: string;
  muscle: Muscle;
  bodyweight: boolean;
};
const norm = (name: string) =>
  name.toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
export function muscleGroup(primary: string | null | undefined): Muscle {
  const name = (primary || "").toLowerCase();
  if (/chest|pector/.test(name)) return "Chest";
  if (/back|lat|trap/.test(name)) return "Back";
  if (/shoulder|deltoid/.test(name)) return "Shoulders";
  if (/bicep|tricep|forearm/.test(name)) return "Arms";
  if (/abdominal|abs|core|oblique/.test(name)) return "Core";
  if (/quad|hamstring|glute|calf|calves|adductor|abductor|leg/.test(name))
    return "Legs";
  return "Other";
}
export function catalogIndex(catalog: CatalogLift[]) {
  const index = new Map<string, CatalogLift>();
  for (const lift of catalog) {
    index.set(lift.id, lift);
    if (!index.has(norm(lift.name))) index.set(norm(lift.name), lift);
  }
  for (const [alias, name] of Object.entries({
    bench: "barbell bench press",
    "bench press": "barbell bench press",
    squat: "barbell squat",
    deadlift: "barbell deadlift",
    ohp: "barbell shoulder press",
  })) {
    const found = index.get(name);
    if (found) index.set(alias, found);
  }
  return index;
}
export function describeLift(
  row: { [key: string]: Entry[string] },
  index: Map<string, CatalogLift>,
): LiftInfo {
  const lift =
    index.get(String(row.exercise_id || "")) ||
    index.get(norm(String(row.exercise)));
  const equipment = lift?.equipment?.toLowerCase();
  return {
    key: lift?.id || String(row.exercise_id || norm(String(row.exercise))),
    id:
      lift?.id ||
      (typeof row.exercise_id === "string" ? row.exercise_id : null),
    name: lift?.name || String(row.exercise),
    muscle: muscleGroup(lift?.primary_muscle),
    bodyweight:
      /body\s*(only|weight)/.test(equipment || "") ||
      /pull[\s_-]*ups?|chin[\s_-]*ups?|push[\s_-]*ups?|\bdips?\b|leg[\s_-]+raises?/i.test(
        lift?.name || String(row.exercise),
      ),
  };
}
export const estimated1RM = (weightKg: number, reps: number) =>
  weightKg * (1 + reps / 30);
export function rowTime(row: Entry) {
  return (
    String(row.date) +
    " " +
    String(row.performed_at || readSessionNote(row.notes)?.startedAt || "") +
    " " +
    String(readSessionNote(row.notes)?.startedAt || "")
  );
}
export function entrySession(row: Entry) {
  const id = readSessionNote(row.notes)?.id;
  return id && !id.startsWith("manual-") ? id : "legacy-" + row.date;
}
export function recordSession(row: Entry) {
  const note = readSessionNote(row.notes);
  return note?.id.startsWith("manual-")
    ? note.id + "|" + note.startedAt
    : entrySession(row);
}
export type LiftGroup = LiftInfo & {
  rows: Entry[];
  sets: number;
  reps: number;
  volumeKg: number;
};
export type DaySession = {
  date: string;
  groups: LiftGroup[];
  rows: Entry[];
  sets: number;
  reps: number;
  volumeKg: number;
  unit?: CardUnit;
};
export function groupSessions(
  rows: Entry[],
  catalog: CatalogLift[],
): DaySession[] {
  const index = catalogIndex(catalog),
    days = new Map<string, Entry[]>();
  for (const row of [...rows].sort((a, b) =>
    rowTime(a).localeCompare(rowTime(b)),
  )) {
    const date = String(row.date);
    const list = days.get(date) || [];
    list.push(row);
    days.set(date, list);
  }
  return [...days]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, entries]) => {
      const groups = new Map<string, LiftGroup>();
      for (const row of entries) {
        const info = describeLift(row, index),
          group = groups.get(info.key) || {
            ...info,
            rows: [],
            sets: 0,
            reps: 0,
            volumeKg: 0,
          };
        group.rows.push(row);
        group.sets += Number(row.sets);
        group.reps += Number(row.sets) * Number(row.reps);
        group.volumeKg +=
          Number(row.sets) * Number(row.reps) * Number(row.weight_kg);
        groups.set(info.key, group);
      }
      return {
        date,
        rows: entries,
        groups: [...groups.values()],
        sets: [...groups.values()].reduce((n, g) => n + g.sets, 0),
        reps: [...groups.values()].reduce((n, g) => n + g.reps, 0),
        volumeKg: [...groups.values()].reduce((n, g) => n + g.volumeKg, 0),
        unit: readSessionNote(entries.at(-1)?.notes)?.unit,
      };
    });
}
export type LiftRecord = LiftInfo & {
  row: Entry;
  estimate: number;
  badge: "Baseline" | "PR";
  baseline: Entry;
  sessionId: string;
  previous?: Entry;
};
function better(a: Entry, b: Entry, bodyweight: boolean) {
  const first = estimated1RM(Number(a.weight_kg), Number(a.reps)),
    second = estimated1RM(Number(b.weight_kg), Number(b.reps));
  return (
    first > second + 0.000001 ||
    (bodyweight &&
      first === 0 &&
      second === 0 &&
      Number(a.reps) > Number(b.reps))
  );
}
export function liftRecords(rows: Entry[], catalog: CatalogLift[]) {
  const index = catalogIndex(catalog),
    sessions = new Map<
      string,
      { info: LiftInfo; rows: Entry[]; sessionId: string }
    >();
  for (const row of [...rows].sort((a, b) =>
    rowTime(a).localeCompare(rowTime(b)),
  )) {
    const info = describeLift(row, index),
      sessionId = recordSession(row),
      key = info.key + "|" + sessionId;
    const session = sessions.get(key) || { info, rows: [], sessionId };
    session.rows.push(row);
    sessions.set(key, session);
  }
  const records = new Map<string, LiftRecord>(),
    awards = new Map<string, LiftRecord>();
  for (const { info, rows: entries, sessionId } of sessions.values()) {
    const best = entries.reduce((a, b) =>
        better(b, a, info.bodyweight) ? b : a,
      ),
      previous = records.get(info.key);
    if (!previous || better(best, previous.row, info.bodyweight)) {
      const record: LiftRecord = {
        ...info,
        row: best,
        estimate: estimated1RM(Number(best.weight_kg), Number(best.reps)),
        badge: previous ? "PR" : "Baseline",
        baseline: previous?.baseline || best,
        sessionId,
        previous: previous?.row,
      };
      records.set(info.key, record);
      awards.set(info.key + "|" + sessionId, record);
    }
  }
  return { records: [...records.values()], awards };
}
export function latestEntry(
  rows: Entry[],
  info: LiftInfo,
  catalog: CatalogLift[],
) {
  const index = catalogIndex(catalog);
  return [...rows]
    .filter((row) => describeLift(row, index).key === info.key)
    .sort((a, b) => rowTime(b).localeCompare(rowTime(a)))[0];
}
export function nextTarget(record: LiftRecord) {
  // Small isolation lifts advance reps before suggesting another plate.
  const light =
    /raise|fly|hammer/i.test(record.name) ||
    Number(record.row.weight_kg) < 9.0718474;
  return {
    weightKg: Number(record.row.weight_kg) + (light ? 0 : 2.26796185),
    reps: Math.min(1000, Number(record.row.reps) + (light ? 1 : 0)),
  };
}
export function weekDates(date: string) {
  const d = new Date(date + "T12:00:00Z"),
    offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setUTCDate(x.getUTCDate() + i);
    return x.toISOString().slice(0, 10);
  });
}
export function weeklySessions(rows: Entry[], date: string) {
  const days = new Set(weekDates(date));
  return new Set(rows.filter((r) => days.has(String(r.date))).map(entrySession))
    .size;
}
export function streakDays(rows: Entry[], date: string) {
  const days = new Set(rows.map((r) => String(r.date)));
  const d = new Date(date + "T12:00:00Z");
  if (!days.has(date)) d.setUTCDate(d.getUTCDate() - 1);
  let streak = 0;
  while (days.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return streak;
}
export type LiveSet = {
  id: string;
  weightKg: number;
  reps: number;
  rpe: number;
  done: boolean;
  completedAt?: string;
};
export type LiveExercise = LiftInfo & { sets: LiveSet[]; rest: number };
export type LiveWorkout = {
  id: string;
  name: string;
  date: string;
  unit: CardUnit;
  startedAt: string;
  pausedAt?: number;
  pausedMs?: number;
  current: number;
  selected: number;
  restEndsAt: number | null;
  restLength: number;
  restSetId?: string;
  exercises: LiveExercise[];
};
export function validLive(value: unknown): value is LiveWorkout {
  if (!value || typeof value !== "object") return false;
  const v = value as LiveWorkout;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    v.name.length <= 120 &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.date) &&
    ["kg", "lb"].includes(v.unit) &&
    Number.isFinite(Date.parse(v.startedAt)) &&
    (v.pausedAt === undefined ||
      (Number.isSafeInteger(v.pausedAt) &&
        v.pausedAt >= Date.parse(v.startedAt))) &&
    (v.pausedMs === undefined ||
      (Number.isSafeInteger(v.pausedMs) && v.pausedMs >= 0)) &&
    Number.isInteger(v.current) &&
    Number.isInteger(v.selected) &&
    Array.isArray(v.exercises) &&
    v.exercises.length > 0 &&
    v.exercises.length <= 100 &&
    v.current >= 0 &&
    v.current < v.exercises.length &&
    v.selected >= 0 &&
    Array.isArray(v.exercises[v.current]?.sets) &&
    v.selected < v.exercises[v.current].sets.length &&
    (v.restEndsAt === null || Number.isFinite(v.restEndsAt)) &&
    Number.isFinite(v.restLength) &&
    v.restLength >= 0 &&
    v.restLength <= 3600 &&
    v.exercises.every(
      (e) =>
        !!e &&
        typeof e === "object" &&
        typeof e.key === "string" &&
        typeof e.name === "string" &&
        e.name.length <= 300 &&
        e.id !== null &&
        typeof e.id === "string" &&
        Object.hasOwn(muscleColors, e.muscle) &&
        typeof e.bodyweight === "boolean" &&
        Number.isFinite(e.rest) &&
        e.rest >= 0 &&
        e.rest <= 3600 &&
        Array.isArray(e.sets) &&
        e.sets.length > 0 &&
        e.sets.length <= 100 &&
        e.sets.every(
          (s) =>
            !!s &&
            typeof s === "object" &&
            typeof s.id === "string" &&
            Number.isFinite(s.weightKg) &&
            s.weightKg >= 0 &&
            s.weightKg <= 1000 &&
            Number.isInteger(s.reps) &&
            s.reps >= 1 &&
            s.reps <= 1000 &&
            Number.isFinite(s.rpe) &&
            s.rpe >= 1 &&
            s.rpe <= 10 &&
            typeof s.done === "boolean" &&
            (!s.completedAt || Number.isFinite(Date.parse(s.completedAt))),
        ),
    )
  );
}
export function elapsedWorkoutSeconds(live: LiveWorkout, now: number) {
  return Math.max(
    0,
    ((live.pausedAt ?? now) -
      Date.parse(live.startedAt) -
      (live.pausedMs || 0)) /
      1000,
  );
}
export function setWorkoutPaused(
  live: LiveWorkout,
  paused: boolean,
  now: number,
): LiveWorkout {
  if (paused)
    return live.pausedAt === undefined
      ? { ...live, pausedAt: Math.max(now, Date.parse(live.startedAt)) }
      : live;
  if (live.pausedAt === undefined) return live;
  return {
    ...live,
    pausedAt: undefined,
    pausedMs: (live.pausedMs || 0) + Math.max(0, now - live.pausedAt),
  };
}
export function exerciseEncouragement(completed: number, total: number) {
  if (!completed) return "Keep going!";
  if (total > 1 && completed === Math.ceil(total / 2))
    return "You're halfway there!";
  if (total > 2 && completed === total - 1)
    return "Last exercise. Finish strong!";
  return [
    "Great work!",
    "Keep going!",
    "You've got this!",
    "Every rep counts!",
  ][(completed - 1) % 4];
}
export function completedEntries(live: LiveWorkout, endedAt: string): Entry[] {
  const note: SessionNote = {
    id: live.id,
    name: live.name,
    unit: live.unit,
    startedAt: live.startedAt,
    endedAt,
  };
  return live.exercises.flatMap((e) =>
    e.sets
      .filter((s) => s.done)
      .map((s) => ({
        id: s.id,
        date: live.date,
        exercise: e.name,
        exercise_id: e.id,
        performed_at: s.completedAt || endedAt,
        sets: 1,
        reps: s.reps,
        weight_kg: s.weightKg,
        rpe: s.rpe,
        notes: sessionNotes("", note),
      })),
  );
}

// Stable set IDs let a refreshed draft recognize an already-committed save.
export function reconcileFinishedWorkout(
  live: LiveWorkout,
  saved: Entry[],
  endedAt: string,
) {
  const existing = new Map(saved.map((row) => [row.id, row]));
  const completed = completedEntries(live, endedAt);
  const rows = completed.map((row) => {
    const stored = existing.get(row.id);
    if (stored && readSessionNote(stored.notes)?.id !== live.id)
      throw new Error(
        "This draft contains a set from another saved session. Discard the draft and start a new workout.",
      );
    return stored || row;
  });
  const ids = new Set(rows.map((row) => row.id));
  return {
    rows,
    additions: rows.filter((row) => !existing.has(row.id)),
    previous: saved.filter((row) => !ids.has(row.id)),
  };
}
