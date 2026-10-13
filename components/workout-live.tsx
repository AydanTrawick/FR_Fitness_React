"use client";
import { useEffect, useMemo, useState } from "react";
import { WorkoutFullscreen } from "./workout-fullscreen";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  Minus,
  Pencil,
  X,
} from "lucide-react";
import { api } from "@/lib/client";
import { today, type Entry } from "@/lib/tracking";
import { cardNumber, cardWeight, type CardUnit } from "@/lib/share-cards";
import {
  catalogIndex,
  describeLift,
  latestEntry,
  estimated1RM,
  type CatalogLift,
  type LiveWorkout,
  type LiveExercise,
  type LiveSet,
  type LiftRecord,
} from "@/lib/workout-session";
import type { Workout } from "@/lib/workouts";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Field } from "./ui";
export function workoutHaptic() {
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function"
  )
    navigator.vibrate(18);
}
export function formatClock(seconds: number, hours = false) {
  const s = Math.max(0, Math.floor(seconds));
  return (
    (hours ? String(Math.floor(s / 3600)).padStart(2, "0") + ":" : "") +
    String(hours ? Math.floor(s / 60) % 60 : Math.floor(s / 60)).padStart(
      2,
      "0",
    ) +
    ":" +
    String(s % 60).padStart(2, "0")
  );
}
function newSet(weightKg = 0, reps = 8, rpe = 7): LiveSet {
  return { id: crypto.randomUUID(), weightKg, reps, rpe, done: false };
}
export function WorkoutSetup({
  catalog,
  history,
  unit,
  onStart,
  onClose,
}: {
  catalog: CatalogLift[];
  history: Entry[];
  unit: CardUnit;
  onStart: (live: LiveWorkout) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("My workout"),
    [query, setQuery] = useState(""),
    [queue, setQueue] = useState<LiveExercise[]>([]),
    [rest, setRest] = useState(90),
    [templates, setTemplates] = useState<Workout[]>([]),
    [error, setError] = useState("");
  const index = useMemo(() => catalogIndex(catalog), [catalog]);
  useEffect(() => {
    let active = true;
    api<{ workouts: Workout[] }>("library/workouts")
      .then((data) => {
        if (active) setTemplates(data.workouts);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const available = catalog
    .filter(
      (e) =>
        !e.metadata?.timed &&
        !["cardio", "stretching"].includes(e.category || "") &&
        e.name.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .slice(0, 16);
  function add(
    lift: CatalogLift,
    count = 1,
    overrideWeight?: number,
    repsOverride?: number,
  ) {
    const info = describeLift(
        { exercise: lift.name, exercise_id: lift.id },
        index,
      ),
      last = latestEntry(history, info, catalog);
    return {
      ...info,
      rest,
      sets: Array.from({ length: Math.min(100, count) }, () =>
        newSet(
          overrideWeight ?? Number(last?.weight_kg || 0),
          repsOverride ?? Number(last?.reps || 8),
          Math.min(10, Math.max(6, Math.round(Number(last?.rpe || 7)))),
        ),
      ),
    };
  }
  function repeat() {
    const date = [...history]
      .map((r) => String(r.date))
      .sort()
      .at(-1);
    if (!date) return;
    const grouped = new Map<string, LiveExercise>();
    for (const row of history.filter((r) => r.date === date)) {
      const info = describeLift(row, index),
        lift = info.id ? index.get(info.id) : null;
      if (!lift) continue;
      const value = grouped.get(info.key) || { ...info, rest, sets: [] };
      value.sets.push(
        ...Array.from(
          { length: Math.min(100 - value.sets.length, Number(row.sets)) },
          () =>
            newSet(
              Number(row.weight_kg),
              Number(row.reps),
              Math.min(10, Math.max(6, Math.round(Number(row.rpe) || 7))),
            ),
        ),
      );
      grouped.set(info.key, value);
    }
    if (!grouped.size) {
      setError(
        "These older entries need a catalog match. Choose exercises below to start.",
      );
      return;
    }
    setQueue([...grouped.values()]);
    setName("Repeat workout");
    setError("");
  }
  function template(id: string) {
    const selected = templates.find((w) => w.id === id);
    if (!selected) return;
    if (selected.exercises.some((e) => e.mode === "duration")) {
      setError(
        "Choose a rep-based workout for Live Session. Timed routines are available in your workout builder.",
      );
      return;
    }
    const exercises: LiveExercise[] = [];
    for (const item of selected.exercises) {
      const lift = index.get(item.exerciseId);
      if (!lift) {
        setError(
          "An exercise is unavailable. Refresh the catalog or choose another workout.",
        );
        return;
      }
      exercises.push({
        ...add(
          lift,
          item.sets,
          item.weight ?? undefined,
          Math.min(1000, Number(item.reps.split("-")[0])),
        ),
        rest: item.rest,
      });
    }
    setQueue(exercises);
    setName(selected.name);
    setError("");
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="ws-setup" overlayClassName="ws-overlay">
        <div className="section-top">
          <div>
            <DialogTitle>Build your live session</DialogTitle>
            <DialogDescription>
              Choose your lifts. Add sets as you go; only completed sets are
              saved when you finish.
            </DialogDescription>
          </div>
          <button
            className="ws-icon"
            type="button"
            aria-label="Close session setup"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="form-grid">
          <Field label="Session name">
            <input
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Rest between sets">
            <select
              value={rest}
              onChange={(e) => {
                const value = Number(e.target.value);
                setRest(value);
                setQueue((old) => old.map((l) => ({ ...l, rest: value })));
              }}
            >
              {[30, 60, 90, 120, 180].map((n) => (
                <option key={n} value={n}>
                  {n} seconds
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="row wrap">
          <button
            className="ws-button secondary"
            disabled={!history.length}
            onClick={repeat}
          >
            Repeat last workout
          </button>
          {templates.length > 0 && (
            <Field label="Saved workout">
              <select
                defaultValue=""
                onChange={(e) => template(e.target.value)}
              >
                <option value="" disabled>
                  Choose a workout
                </option>
                {templates.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <Field label="Find a session exercise">
          <input
            type="search"
            placeholder="Search the exercise catalog…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>
        <div className="ws-catalog-results">
          {available.map((lift) => (
            <button
              type="button"
              key={lift.id}
              disabled={
                queue.some((e) => e.id === lift.id) || queue.length >= 100
              }
              onClick={() => {
                setQueue((old) => [...old, add(lift)]);
                setError("");
              }}
            >
              <span>{lift.name}</span>
              <Plus size={18} />
            </button>
          ))}
        </div>
        {!catalog.length && (
          <p className="muted">
            The catalog is loading or unavailable. Reload the page to try again.
          </p>
        )}
        {queue.length > 0 && (
          <ol className="ws-queue">
            {queue.map((lift, i) => (
              <li key={lift.key + "-" + i}>
                <span>
                  <b>{i + 1}.</b> {lift.name}
                  <small>
                    {lift.sets.length} {lift.sets.length === 1 ? "set" : "sets"}{" "}
                    planned
                  </small>
                </span>
                <button
                  className="ws-icon"
                  aria-label={"Remove " + lift.name}
                  onClick={() =>
                    setQueue((old) => old.filter((_, n) => n !== i))
                  }
                >
                  <X size={18} />
                </button>
              </li>
            ))}
          </ol>
        )}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <button
          className="ws-button primary full"
          disabled={!queue.length || !name.trim()}
          onClick={() =>
            onStart({
              id: crypto.randomUUID(),
              name: name.trim(),
              date: today(),
              unit,
              startedAt: new Date().toISOString(),
              current: 0,
              selected: 0,
              restEndsAt: null,
              restLength: 90,
              exercises: queue,
            })
          }
        >
          Start workout · {queue.length}{" "}
          {queue.length === 1 ? "exercise" : "exercises"}
        </button>
      </DialogContent>
    </Dialog>
  );
}
function Stepper({
  label,
  value,
  display,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  step: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className={"ws-stepper " + (display.length > 3 ? "long" : "")}>
      <span>{label}</span>
      <div>
        <button
          className="ws-icon"
          aria-label={"Decrease " + label}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - step))}
        >
          <Minus size={22} />
        </button>
        <strong aria-live="polite">{display}</strong>
        <button
          className="ws-icon"
          aria-label={"Increase " + label}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
        >
          <Plus size={22} />
        </button>
      </div>
    </div>
  );
}
export function LiveSession({
  live,
  history,
  catalog,
  records,
  onChange,
  onBack,
  onDiscard,
  onFinish,
  busy,
  error,
}: {
  live: LiveWorkout;
  history: Entry[];
  catalog: CatalogLift[];
  records: LiftRecord[];
  onChange: (live: LiveWorkout) => void;
  onBack: () => void;
  onDiscard: () => void;
  onFinish: () => void;
  busy: boolean;
  error: string;
}) {
  const [now, setNow] = useState(() => Date.now()),
    [confirmation, setConfirmation] = useState<"finish" | "discard" | null>(
      null,
    );
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearInterval(timer);
      document.body.style.overflow = before;
    };
  }, []);
  const exercise = live.exercises[live.current],
    selected = exercise.sets[live.selected];
  const last = useMemo(
    () => latestEntry(history, exercise, catalog),
    [history, exercise, catalog],
  );
  const total = live.exercises.reduce((n, e) => n + e.sets.length, 0),
    done = live.exercises.reduce(
      (n, e) => n + e.sets.filter((s) => s.done).length,
      0,
    ),
    remaining = Math.max(0, Math.ceil(((live.restEndsAt || 0) - now) / 1000));
  const record = records.find((r) => r.key === exercise.key),
    inReach =
      record &&
      estimated1RM(selected.weightKg, selected.reps) >
        record.estimate + 0.000001;
  function changeSet(patch: Partial<LiveSet>) {
    onChange({
      ...live,
      exercises: live.exercises.map((e, i) =>
        i === live.current
          ? {
              ...e,
              sets: e.sets.map((s, j) =>
                j === live.selected ? { ...s, ...patch } : s,
              ),
            }
          : e,
      ),
    });
  }
  function complete(index: number, completedMs: number) {
    if (busy) return;
    const set = exercise.sets[index],
      mark = !set.done,
      sets = exercise.sets.map((s, i) =>
        i === index
          ? {
              ...s,
              done: mark,
              completedAt: mark
                ? new Date(completedMs).toISOString()
                : undefined,
            }
          : s,
      ),
      next = sets.findIndex((s) => !s.done);
    const rest = exercise.rest || 0;
    onChange({
      ...live,
      selected: next < 0 ? index : next,
      restEndsAt:
        mark && rest
          ? completedMs + rest * 1000
          : !mark && live.restSetId === set.id
            ? null
            : live.restEndsAt,
      restLength: mark ? rest : live.restLength,
      restSetId: mark ? set.id : live.restSetId,
      exercises: live.exercises.map((e, i) =>
        i === live.current ? { ...e, sets } : e,
      ),
    });
    if (mark) workoutHaptic();
  }
  function navigate(index: number) {
    const next = live.exercises[index].sets.findIndex((s) => !s.done);
    onChange({ ...live, current: index, selected: Math.max(0, next) });
  }
  function finish() {
    if (total > done) setConfirmation("finish");
    else onFinish();
  }
  const next = live.exercises[live.current + 1],
    nextLast = next ? latestEntry(history, next, catalog) : undefined,
    hasPending = exercise.sets.some((s) => !s.done),
    radius = 46,
    circumference = 2 * Math.PI * radius;
  return (
    <WorkoutFullscreen
      label="Live workout session"
      onClose={onBack}
      busy={busy}
    >
      <div className="ws-live-content">
        <header className="ws-live-header">
          <button
            className="ws-icon"
            aria-label="Back to workout log"
            disabled={busy}
            onClick={onBack}
          >
            <ArrowLeft size={25} />
          </button>
          <div>
            <p className="eyebrow">LIVE SESSION</p>
            <strong aria-label="Elapsed workout time">
              {formatClock((now - Date.parse(live.startedAt)) / 1000, true)}
            </strong>
          </div>
          <button
            className="ws-button secondary"
            disabled={busy || !done}
            onClick={finish}
          >
            Finish workout
          </button>
        </header>
        <div className="ws-progress-label">
          <span>
            Exercise {live.current + 1} of {live.exercises.length}
          </span>
          <span>
            {done} of {total} sets done
          </span>
        </div>
        <div
          className="ws-segments"
          aria-label={
            "Exercise " + (live.current + 1) + " of " + live.exercises.length
          }
        >
          {live.exercises.map((e, i) => (
            <span
              key={e.key + "-" + i}
              className={
                e.sets.every((s) => s.done)
                  ? "done"
                  : i === live.current
                    ? "current"
                    : ""
              }
            />
          ))}
        </div>
        <div className="ws-live-utility">
          <button
            className="ws-button secondary"
            disabled={!live.current || busy}
            onClick={() => navigate(live.current - 1)}
          >
            <ChevronLeft size={18} /> Previous
          </button>
          <div className="ws-units" aria-label="Live weight unit">
            {(["lb", "kg"] as const).map((unit) => (
              <button
                aria-pressed={live.unit === unit}
                key={unit}
                onClick={() => onChange({ ...live, unit })}
                disabled={busy}
              >
                {unit}
              </button>
            ))}
          </div>
          <button
            className="ws-button secondary"
            disabled={!next || busy}
            onClick={() => navigate(live.current + 1)}
          >
            Next <ChevronRight size={18} />
          </button>
        </div>
        <article className="ws-live-card">
          <div className="ws-lift-heading">
            <div>
              <p className="eyebrow" style={{ color: "#a3b8ff" }}>
                {exercise.muscle}
              </p>
              <h1>{exercise.name}</h1>
            </div>
            <span className="ws-badge orange">
              {!record
                ? "Baseline in reach"
                : inReach
                  ? "PR in reach"
                  : "Build your progress"}
            </span>
          </div>
          <div className="ws-last-time">
            <Clock3 size={19} />
            {last ? (
              <span>
                Last time ({String(last.date).slice(5)}):{" "}
                <b>
                  {Number(last.sets)} × {Number(last.reps)} @{" "}
                  {exercise.bodyweight ? "+" : ""}
                  {cardNumber(
                    cardWeight(Number(last.weight_kg), live.unit),
                  )}{" "}
                  {live.unit}
                </b>
              </span>
            ) : (
              <span>First time logging this lift. Set your baseline.</span>
            )}
          </div>
          <div className="ws-live-sets">
            {exercise.sets.map((set, i) => (
              <div
                key={set.id}
                className={
                  "ws-set-row " +
                  (set.done ? "done " : "") +
                  (i === live.selected ? "selected" : "")
                }
              >
                <button
                  className="ws-set-tap"
                  aria-label={
                    set.done
                      ? "Undo set " + (i + 1)
                      : "Complete set " + (i + 1) + " by tapping row"
                  }
                  aria-pressed={set.done}
                  disabled={busy}
                  onClick={() => complete(i, Date.now())}
                >
                  <span className="ws-set-number">{i + 1}</span>
                  <strong>
                    {exercise.bodyweight ? "+" : ""}
                    {cardNumber(cardWeight(set.weightKg, live.unit))}{" "}
                    {live.unit} × {set.reps}
                  </strong>
                  <span className="ws-rpe-label">RPE {set.rpe}</span>
                  <span className="ws-set-check">
                    {set.done && <Check size={22} />}
                  </span>
                </button>
                <button
                  className="ws-icon ws-adjust"
                  aria-label={"Adjust set " + (i + 1)}
                  disabled={busy || set.done}
                  onClick={() => onChange({ ...live, selected: i })}
                >
                  <Pencil size={17} />
                </button>
              </div>
            ))}
          </div>
          <button
            className="ws-button secondary full"
            disabled={busy || exercise.sets.length >= 100}
            onClick={() => {
              const previous = exercise.sets.at(-1)!;
              onChange({
                ...live,
                selected: exercise.sets.length,
                exercises: live.exercises.map((e, i) =>
                  i === live.current
                    ? {
                        ...e,
                        sets: [
                          ...e.sets,
                          newSet(
                            previous.weightKg,
                            previous.reps,
                            previous.rpe,
                          ),
                        ],
                      }
                    : e,
                ),
              });
            }}
          >
            <Plus size={18} /> Add set
          </button>
          <p className="muted">
            {selected.done
              ? "Choose Add set to keep going, or move to the next exercise."
              : "Adjust set " + (live.selected + 1)}
          </p>
          <fieldset disabled={busy || selected.done} className="ws-set-editor">
            <div className="form-grid">
              <Stepper
                label={"Weight (" + live.unit + ")"}
                value={selected.weightKg}
                display={
                  (exercise.bodyweight ? "+" : "") +
                  cardNumber(cardWeight(selected.weightKg, live.unit))
                }
                min={0}
                max={1000}
                step={2.26796185}
                onChange={(weightKg) => changeSet({ weightKg })}
              />
              <Stepper
                label="Reps"
                value={selected.reps}
                display={String(selected.reps)}
                min={1}
                max={1000}
                step={1}
                onChange={(reps) => changeSet({ reps })}
              />
            </div>
            <small className="muted">
              Weight changes by 5 lb ({cardNumber(2.26796185)} kg). Reps change
              by 1.
            </small>
            <div className="ws-effort" aria-label="Set effort">
              <span>Effort</span>
              {[6, 7, 8, 9, 10].map((rpe) => (
                <button
                  key={rpe}
                  type="button"
                  aria-label={"RPE " + rpe}
                  aria-pressed={selected.rpe === rpe}
                  onClick={() => changeSet({ rpe })}
                >
                  {rpe}
                </button>
              ))}
            </div>
          </fieldset>
        </article>
        <section className="ws-rest-card" aria-label="Rest timer">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r={radius} />
            <circle
              className="ws-rest-ring"
              cx="60"
              cy="60"
              r={radius}
              style={{
                strokeDasharray: circumference,
                strokeDashoffset:
                  circumference *
                  (1 - Math.min(1, remaining / Math.max(1, live.restLength))),
              }}
            />
          </svg>
          <div>
            <span>Rest</span>
            <strong role="timer" aria-label="Rest time remaining">
              {formatClock(remaining)}
            </strong>
            <small>
              {live.restEndsAt && remaining === 0
                ? "Ready for your next set"
                : ""}
            </small>
          </div>
          <button
            className="ws-button secondary"
            disabled={busy || remaining >= 3600}
            onClick={() =>
              onChange({
                ...live,
                restEndsAt: Date.now() + Math.min(3600, remaining + 30) * 1000,
                restLength: Math.min(3600, remaining + 30),
              })
            }
          >
            +30s
          </button>
          <button
            className="ws-button secondary"
            disabled={busy}
            onClick={() => onChange({ ...live, restEndsAt: null })}
          >
            Skip
          </button>
        </section>
        <p className="ws-up-next">
          Up next <b>{next?.name || "Session recap"}</b>
          {next && (
            <span>
              · {next.sets.length} sets{" "}
              {nextLast ? (
                <>
                  · last {next.bodyweight ? "+" : ""}
                  {cardNumber(
                    cardWeight(Number(nextLast.weight_kg), live.unit),
                  )}{" "}
                  {live.unit}
                </>
              ) : (
                "· first log"
              )}
            </span>
          )}
        </p>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {confirmation && (
          <section className="ws-inline-confirm" role="alert">
            <h3>
              {confirmation === "discard"
                ? "Discard this unsaved workout?"
                : total - done + " sets are still unfinished."}
            </h3>
            <p>
              {confirmation === "discard"
                ? "Completed sets in this draft have not been saved."
                : "Only your " +
                  done +
                  " completed sets will be added to your workout log."}
            </p>
            <div className="row wrap">
              <button
                className="ws-button secondary"
                disabled={busy}
                onClick={() => setConfirmation(null)}
              >
                Keep training
              </button>
              <button
                className="ws-button primary"
                disabled={busy}
                onClick={confirmation === "discard" ? onDiscard : onFinish}
              >
                {confirmation === "discard"
                  ? "Discard workout"
                  : "Save completed sets & finish"}
              </button>
            </div>
          </section>
        )}
        <button
          className="ws-text-button"
          disabled={busy}
          onClick={() => setConfirmation("discard")}
        >
          Discard workout
        </button>
        <p className="ws-footer">Educational tools. Not medical advice.</p>
        <div className="ws-live-bottom">
          <button
            className="ws-button primary full"
            disabled={busy}
            onClick={() =>
              hasPending
                ? complete(
                    selected.done
                      ? exercise.sets.findIndex((s) => !s.done)
                      : live.selected,
                    Date.now(),
                  )
                : next
                  ? navigate(live.current + 1)
                  : finish()
            }
          >
            <Check size={24} />
            {busy
              ? "Saving your workout…"
              : hasPending
                ? "Complete set " +
                  ((selected.done
                    ? exercise.sets.findIndex((s) => !s.done)
                    : live.selected) +
                    1)
                : next
                  ? "Next exercise"
                  : "Finish workout"}
          </button>
        </div>
      </div>
    </WorkoutFullscreen>
  );
}
