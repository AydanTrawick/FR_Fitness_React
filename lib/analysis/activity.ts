import {
  normalizeExercise,
  canonicalMuscle,
  exercisePattern,
  type TaxonomyExercise,
} from "../exercise-taxonomy.ts";
import { readSessionNote } from "../workout-session.ts";
import type { Session, SetLog } from "./types.ts";
type Row = Record<string, unknown>;
export function activityIndex(rows: TaxonomyExercise[]) {
  const index = new Map<string, TaxonomyExercise>();
  for (const row of rows) {
    const exercise = normalizeExercise(row);
    index.set(row.id, exercise);
    index.set(row.name.toLowerCase().trim(), exercise);
    for (const alias of row.aliases ?? []) index.set(alias, exercise);
  }
  return index;
}
export function analysisSet(
  row: Row,
  index: Map<string, TaxonomyExercise>,
): SetLog {
  const e =
    index.get(String(row.exercise_id)) ??
    index.get(
      String(row.exercise ?? "")
        .toLowerCase()
        .trim(),
    );
  const note = readSessionNote(row.notes);
  return {
    exerciseId: e?.id ?? String(row.exercise_id ?? row.exercise),
    name: e?.name ?? String(row.exercise ?? row.exercise_id),
    primary:
      e?.primary_muscle ||
      (note?.targetMuscle
        ? canonicalMuscle(note.targetMuscle)
        : "Unclassified"),
    primaryMuscles: e?.primary_muscles?.length
      ? e.primary_muscles
      : [
          note?.targetMuscle
            ? canonicalMuscle(note.targetMuscle)
            : e?.primary_muscle || "Unclassified",
        ],
    secondary: e?.secondary_muscles ?? [],
    pattern: note?.movementPattern
      ? exercisePattern({
          id: "custom",
          name: "",
          movement_pattern: note.movementPattern,
        })
      : e
        ? exercisePattern(e)
        : exercisePattern({
            id: "custom",
            name: String(row.exercise || ""),
            primary_muscle: note?.targetMuscle,
          }),
    reps: row.reps == null ? null : Number(row.reps),
    weight:
      (row.weight ?? row.weight_kg) == null
        ? null
        : Number(row.weight ?? row.weight_kg),
    warmup: row.is_warmup === true,
    count: Number(row.sets ?? 1),
  };
}
export function entrySessions(
  rows: Row[],
  index: Map<string, TaxonomyExercise>,
): Session[] {
  const sessions = new Map<string, Session>();
  for (const row of rows) {
    const date = String(row.date).slice(0, 10),
      note = readSessionNote(row.notes);
    const timed = note && !note.id.startsWith("manual-") && note.endedAt;
    const id = timed ? note.id : `legacy-${date}`;
    const session = sessions.get(id) ?? {
      id,
      startedAt: timed ? note.startedAt : date + "T12:00:00Z",
      completedAt: timed ? note.endedAt! : date + "T12:00:00Z",
      dateOnly: date,
      legacy: !timed,
      durationSeconds: timed ? note.durationSeconds : undefined,
      sets: [],
    };
    session.sets.push(analysisSet(row, index));
    sessions.set(id, session);
  }
  return [...sessions.values()];
}
