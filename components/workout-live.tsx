"use client";
import { completePlannedSet } from "@/lib/session/live";
import { useEffect, useMemo, useState } from "react";
import { WorkoutFullscreen } from "./workout-fullscreen";
import {
  ManualWeightInput,
  WorkoutEncouragement,
  useExerciseEncouragement,
} from "./workout-controls";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  Minus,
  Pencil,
  Pause,
  Play,
} from "lucide-react";
import { type Entry } from "@/lib/tracking";
import { cardNumber, cardWeight } from "@/lib/share-cards";
import {
  latestEntry,
  estimated1RM,
  elapsedWorkoutSeconds,
  setWorkoutPaused,
  type CatalogLift,
  type LiveWorkout,
  type LiveSet,
  type LiftRecord,
} from "@/lib/workout-session";

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
export { SessionBuilder as WorkoutSetup } from "./session/builder";

function Stepper({
  label,
  value,
  display,
  step,
  min,
  max,
  onChange,
  manual,
}: {
  label: string;
  value: number;
  display: string;
  step: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  manual?: {
    value: number;
    max: number;
    prefix: boolean;
    onChange: (n: number) => void;
    onInvalidChange: (invalid: boolean) => void;
  };
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
        {manual ? (
          <ManualWeightInput key={label} label={label} {...manual} />
        ) : (
          <strong aria-live="polite">{display}</strong>
        )}
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
    [weightInvalid, setWeightInvalid] = useState(false),
    [confirmation, setConfirmation] = useState<"finish" | "discard" | null>(
      null,
    );
  const { notice, celebrate } = useExerciseEncouragement();
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
    if (busy || weightInvalid) return;
    const mark = !exercise.sets[index].done;
    onChange(completePlannedSet(live, index, completedMs));
    if (mark) workoutHaptic();
  }
  function navigate(index: number) {
    if (index > live.current)
      celebrate(
        live.exercises.filter((e) => e.sets.every((s) => s.done)).length,
        live.exercises.length,
      );
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
              {formatClock(elapsedWorkoutSeconds(live, now), true)}
            </strong>
            <button
              className="ws-timer-toggle"
              aria-label={
                live.pausedAt === undefined
                  ? "Pause workout timer"
                  : "Resume workout timer"
              }
              disabled={busy}
              onClick={() => {
                const time = Date.now();
                setNow(time);
                onChange(
                  setWorkoutPaused(live, live.pausedAt === undefined, time),
                );
              }}
            >
              {live.pausedAt === undefined ? (
                <Pause size={16} />
              ) : (
                <Play size={16} />
              )}
              {live.pausedAt === undefined ? "Pause" : "Resume"}
            </button>
            {live.pausedAt !== undefined && (
              <span className="ws-paused-label" role="status">
                Timer paused
              </span>
            )}
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
                manual={{
                  value: cardWeight(selected.weightKg, live.unit),
                  max: cardWeight(1000, live.unit),
                  prefix: exercise.bodyweight,
                  onChange: (value) =>
                    changeSet({
                      weightKg: value * (live.unit === "lb" ? 0.45359237 : 1),
                    }),
                  onInvalidChange: setWeightInvalid,
                }}
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
              by 1. Tap the weight to type any value.
            </small>
            <div className="ws-effort" aria-label="Set effort">
              <span>Effort</span>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((rpe) => (
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
            disabled={busy || (hasPending && weightInvalid)}
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
        <WorkoutEncouragement notice={notice} />
      </div>
    </WorkoutFullscreen>
  );
}
