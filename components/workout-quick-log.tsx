"use client";
import { useState, type FormEvent } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { today, toKg, type Entry } from "@/lib/tracking";
import { api, errorText } from "@/lib/client";
import { targetMuscles } from "@/lib/exercise-taxonomy";
import { sessionNotes } from "@/lib/workout-session";
import type { CardUnit } from "@/lib/share-cards";
import content from "@/lib/content.json";
import { useStore } from "./store";
import { Card, Field } from "./ui";
import { NewPRButton } from "./workout-share-cards";
type ExerciseMatch = {
  match: { id: string; name: string } | null;
  candidates: { id: string; name: string }[];
};
const resolveExercise = (name: string) =>
  api<ExerciseMatch>("exercises/match?name=" + encodeURIComponent(name));
type WorkoutSet = { id: string; reps: string; weight: string; rpe: string };
const firstWorkoutSet = (): WorkoutSet => ({
  id: "first",
  reps: "8",
  weight: "20",
  rpe: "7",
});
export function WorkoutQuickLog({
  onSaved,
  initialUnit,
}: {
  initialUnit: CardUnit;
  onSaved: (rows: Entry[], previous: Entry[]) => void;
}) {
  const { logs, save, busy, setError } = useStore();
  const [unit, setUnit] = useState<CardUnit>(initialUnit);
  const [date, setDate] = useState(today);
  const [exercise, setExercise] = useState("");
  const [targetMuscle, setTargetMuscle] = useState("");
  const [custom, setCustom] = useState(false);
  const [movementPattern, setMovementPattern] = useState("");
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [candidates, setCandidates] = useState<ExerciseMatch["candidates"]>([]);
  const [sets, setSets] = useState<WorkoutSet[]>(() => [firstWorkoutSet()]);
  function updateSet(
    id: string,
    field: "reps" | "weight" | "rpe",
    value: string,
  ) {
    setSets((rows) =>
      rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    let matched: ExerciseMatch["match"];
    try {
      const result = custom
        ? { match: null, candidates: [] }
        : await resolveExercise(selectedExerciseId || exercise);
      matched = result.match;
      if (!matched && !(custom && targetMuscle)) {
        setCandidates(result.candidates);
        throw new Error(
          result.candidates.length
            ? `Did you mean ${result.candidates[0].name}? Choose a suggestion before logging.`
            : "No matching exercise found. Choose one from the catalog.",
        );
      }
    } catch (error) {
      setError(errorText(error));
      return;
    }
    const loggedAt = new Date().toISOString();
    const performedAt = date === today() ? loggedAt : `${date}T12:00:00.000Z`;
    const rows = sets.map(
      (set) =>
        ({
          id: crypto.randomUUID(),
          date,
          exercise: matched?.name || exercise.trim(),
          exercise_id: matched?.id ?? null,
          performed_at: performedAt,
          sets: 1,
          reps: Number(set.reps),
          weight_kg: toKg(Number(set.weight), unit),
          rpe: Number(set.rpe),
          notes: sessionNotes(String(fields.notes || ""), {
            id: "manual-" + date,
            name: "Workout",
            unit,
            startedAt: loggedAt,
            endedAt: loggedAt,
            ...(custom
              ? { targetMuscle, movementPattern: movementPattern || undefined }
              : {}),
          }),
        }) as Entry,
    );
    if (await save("workout", [...logs.workout, ...rows])) {
      onSaved(rows, logs.workout);
      setSets([firstWorkoutSet()]);
      setExercise("");
      setSelectedExerciseId("");
      setCandidates([]);
      setCustom(false);
      setTargetMuscle("");
      setMovementPattern("");
    }
  }
  return (
    <Card>
      <div className="section-top workout-log-title">
        <h3>Log an exercise</h3>
        <NewPRButton initialDate={date} initialUnit={unit} />
      </div>
      <form onSubmit={submit} className="stack">
        <div className="form-grid">
          <Field label="Training date">
            <input
              type="date"
              name="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Weight unit">
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as CardUnit)}
            >
              <option value="kg">Kilograms (kg)</option>
              <option value="lb">Pounds (lb)</option>
            </select>
          </Field>
        </div>
        <Field label="Exercise">
          <input
            name="exercise"
            list="exercises"
            placeholder="e.g. Bench Press"
            value={exercise}
            onChange={(e) => {
              setExercise(e.target.value);
              setSelectedExerciseId("");
            }}
            required
            maxLength={300}
          />
          <datalist id="exercises">
            {[
              ...new Set(
                content.programs.flatMap((p) =>
                  p.schedule.flatMap((d) => d.exercises.map((e) => e.name)),
                ),
              ),
            ]
              .sort()
              .map((name) => (
                <option key={name} value={name} />
              ))}
          </datalist>
        </Field>
        <label>
          <input
            type="checkbox"
            checked={custom}
            onChange={(e) => {
              setCustom(e.target.checked);
              setCandidates([]);
            }}
          />{" "}
          Log an exercise outside the library
        </label>
        {custom && (
          <div className="form-grid">
            <Field label="Target muscle">
              <select
                required
                value={targetMuscle}
                onChange={(e) => setTargetMuscle(e.target.value)}
              >
                <option value="">Choose the body area</option>
                {targetMuscles.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Movement (optional)">
              <select
                value={movementPattern}
                onChange={(e) => setMovementPattern(e.target.value)}
              >
                <option value="">Unspecified</option>
                {["push", "pull", "hinge", "squat", "carry", "core"].map(
                  (p) => (
                    <option key={p}>{p}</option>
                  ),
                )}
              </select>
            </Field>
          </div>
        )}
        {candidates.length > 0 && (
          <Field label="Did you mean…?">
            <select
              defaultValue=""
              onChange={(e) => {
                const candidate = candidates.find(
                  (item) => item.id === e.target.value,
                );
                if (candidate) {
                  setExercise(candidate.name);
                  setSelectedExerciseId(candidate.id);
                }
              }}
            >
              <option value="" disabled>
                Choose a catalog exercise
              </option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} ({candidate.id})
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="workout-sets">
          {sets.map((set, index) => (
            <fieldset className="workout-set" key={set.id} disabled={busy}>
              <legend>Set {index + 1}</legend>
              <div className="form-grid three">
                <Field label={`Set ${index + 1} weight (${unit})`}>
                  <input
                    type="number"
                    required
                    min={0}
                    max={unit === "kg" ? 1000 : 2204.62}
                    step="any"
                    value={set.weight}
                    onChange={(event) =>
                      updateSet(set.id, "weight", event.target.value)
                    }
                  />
                </Field>
                <Field label={`Set ${index + 1} reps`}>
                  <input
                    type="number"
                    required
                    min={1}
                    max={1000}
                    step={1}
                    value={set.reps}
                    onChange={(event) =>
                      updateSet(set.id, "reps", event.target.value)
                    }
                  />
                </Field>
                <Field label={`Set ${index + 1} RPE (1–10)`}>
                  <input
                    type="number"
                    required
                    min={1}
                    max={10}
                    step={0.5}
                    value={set.rpe}
                    onChange={(event) =>
                      updateSet(set.id, "rpe", event.target.value)
                    }
                  />
                </Field>
              </div>
              {sets.length > 1 && (
                <button
                  type="button"
                  className="btn subtle"
                  aria-label={`Remove set ${index + 1}`}
                  onClick={() =>
                    setSets((rows) => rows.filter((row) => row.id !== set.id))
                  }
                >
                  <Trash2 size={14} /> Remove set
                </button>
              )}
            </fieldset>
          ))}
          <button
            type="button"
            className="btn"
            disabled={busy || sets.length >= 100}
            onClick={() =>
              setSets((rows) => [
                ...rows,
                { ...rows[rows.length - 1], id: crypto.randomUUID() },
              ])
            }
          >
            <Plus size={16} /> Add set
          </button>
        </div>
        <Field label="Notes (optional)">
          <input name="notes" placeholder="How did it feel?" maxLength={1400} />
        </Field>
        <button className="btn primary" disabled={busy}>
          <Check size={16} /> Save {sets.length}{" "}
          {sets.length === 1 ? "set" : "sets"}
        </button>
      </form>
    </Card>
  );
}
