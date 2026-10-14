"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronDown,
  Clock,
  Download,
  Minus,
  Plus,
  X,
} from "lucide-react";
import { programs } from "@/lib/program-data";
import {
  clock,
  displayWeight,
  durationLabel,
  effectiveExercises,
  matchesFilters,
  muscleSets,
  target,
  type ProgramExercise,
  type ProgramState,
} from "@/lib/programs";
import { download } from "@/lib/client";
import {
  ManualWeightInput,
  WorkoutEncouragement,
  useExerciseEncouragement,
} from "./workout-controls";

type Action = Record<string, string | number | boolean>;
function usePrograms(initialAction = "") {
  const [state, setState] = useState<ProgramState | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const request = useCallback(async (action?: Action) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/programs", {
        cache: "no-store",
        ...(action
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(action),
            }
          : {}),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Your program could not be loaded.");
      setState(data);
      return data as ProgramState;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(
      () =>
        void request(
          initialAction ? JSON.parse(initialAction) : undefined,
        ).catch(() => {}),
      0,
    );
    return () => clearTimeout(timer);
  }, [request, initialAction]);
  const act = (action: Action) => request(action).catch(() => null);
  return {
    state,
    error,
    busy,
    act,
    retry: () =>
      void request(initialAction ? JSON.parse(initialAction) : undefined).catch(
        () => {},
      ),
  };
}
function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return error ? (
    <div className="pl-error" role="alert">
      {error} {retry && <button onClick={retry}>Retry</button>}
    </div>
  ) : null;
}
function ProgramSetDialog({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="pl-log-dialog pl-native-dialog"
      aria-label="Log program set"
      onCancel={onClose}
    >
      {children}
    </dialog>
  );
}
export function ProgramFooter() {
  return (
    <footer className="pl-footer">
      <span>
        <strong>FIRSTREP.</strong> Every rep is a beginning.
      </span>
      <span>Educational tools. Not medical advice.</span>
    </footer>
  );
}
export function ProgramLibrary() {
  const { state, error, busy, act, retry } = usePrograms();
  const [days, setDays] = useState("Any"),
    [length, setLength] = useState("Any"),
    [goal, setGoal] = useState("Any");
  const filtered = programs.filter((p) =>
    matchesFilters(p, days, length, goal),
  );
  const reset = () => {
    setDays("Any");
    setLength("Any");
    setGoal("Any");
  };
  return (
    <section className="pl-library">
      <p className="eyebrow">THE FIRSTREP PROGRAM LIBRARY</p>
      <h1>A plan to show up for.</h1>
      <p className="pl-intro">
        Five original programs. Find the routine that fits your week.
      </p>
      <div className="pl-filters">
        {(
          [
            ["Days per week", ["Any", "3", "4", "5", "6"], days, setDays],
            [
              "Session length",
              ["Any", "<45", "45–60", "60+"],
              length,
              setLength,
            ],
            ["Goal", ["Any", "Strength", "Muscle", "Endurance"], goal, setGoal],
          ] as const
        ).map(([label, options, value, set]) => (
          <fieldset key={label}>
            <legend>{label}</legend>
            <div className="pl-chips">
              {options.map((option) => (
                <button
                  key={option}
                  aria-pressed={value === option}
                  className={value === option ? "selected" : ""}
                  onClick={() => set(option)}
                >
                  {option}
                  {label === "Session length" && option !== "Any" ? " min" : ""}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <button className="pl-reset" onClick={reset}>
          Reset filters
        </button>
      </div>
      <div className="pl-library-meta">
        <div aria-live="polite">
          Showing <strong>{filtered.length}</strong> of {programs.length}{" "}
          programs<small>Session length uses the longest day.</small>
        </div>
        <div className="pl-legend">
          <span>
            <i className="lift" />
            Lift day
          </span>
          <span>
            <i className="conditioning" />
            Conditioning
          </span>
          <span>
            <i className="rest" />
            Rest
          </span>
        </div>
      </div>
      <ErrorBox error={error} retry={retry} />
      <div className="pl-grid">
        {filtered.map((p) => {
          const i = programs.indexOf(p),
            saved =
              state?.preferences.find((s) => s.program_id === p.id)
                ?.bookmarked || false;
          return (
            <article className={`pl-card pl-tint-${i}`} key={p.id}>
              <div className="pl-art">
                <div className="pl-card-top">
                  <strong className="pl-number">0{i + 1}</strong>
                  <span className="pl-tag">
                    {p.schedule.length} days / week
                  </span>
                  <span className="pl-tag">{p.level}</span>
                  <button
                    className={`pl-bookmark ${saved ? "saved" : ""}`}
                    disabled={!state || busy}
                    aria-label={`${saved ? "Unsave" : "Save"} ${p.title}`}
                    aria-pressed={saved}
                    onClick={() =>
                      void act({
                        action: "bookmark",
                        programId: p.id,
                        bookmarked: !saved,
                      })
                    }
                  >
                    <Bookmark
                      size={19}
                      fill={saved ? "currentColor" : "none"}
                    />
                  </button>
                </div>
                <div className="pl-week">
                  {p.weekSchedule.map((day, j) => (
                    <div key={j}>
                      <small>{["M", "T", "W", "T", "F", "S", "S"][j]}</small>
                      <span
                        className={day.kind}
                        title={`${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][j]}: ${day.kind === "rest" ? "Rest" : p.schedule[day.dayIndex!].title}`}
                      >
                        {day.label || "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pl-card-body">
                <p className="eyebrow">
                  {
                    [
                      "BUILD A FOUNDATION",
                      "FIND YOUR BALANCE",
                      "FOCUS YOUR TRAINING",
                      "MIX IT UP",
                      "BUILD ENDURANCE",
                    ][i]
                  }
                </p>
                <h2>{p.title}</h2>
                <p className="pl-description">{p.description}</p>
                <div className="pl-focus">
                  {Object.entries(p.focus).map(([label, value]) => (
                    <div key={label} aria-label={`${label}: ${value} out of 5`}>
                      <span>{label}</span>
                      <div>
                        {[1, 2, 3, 4, 5].map((v) => (
                          <i key={v} className={v <= value ? "filled" : ""} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pl-card-footer">
                <span>
                  <Clock size={16} />
                  {durationLabel(p)}
                </span>
                <Link className="pl-btn secondary" href={`/programs/${p.id}`}>
                  Preview
                </Link>
                <Link className="pl-btn" href={`/programs/${p.id}/workout/1`}>
                  Start week 1
                </Link>
              </div>
            </article>
          );
        })}
      </div>
      {!filtered.length && (
        <div className="pl-empty">
          <h2>No programs match those filters.</h2>
          <p>Try a different number of days, session length, or goal.</p>
          <button className="pl-btn" onClick={reset}>
            Reset filters
          </button>
        </div>
      )}
    </section>
  );
}
function Progress({
  done,
  total,
  label,
}: {
  done: number;
  total: number;
  label: string;
}) {
  return (
    <div
      className="pl-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
    >
      <span
        style={{ width: `${total ? Math.min(done / total, 1) * 100 : 0}%` }}
      />
    </div>
  );
}
function Stepper({
  label,
  value,
  step,
  min = 0,
  max,
  onChange,
  manual,
}: {
  label: string;
  value: number;
  step: number;
  min?: number;
  max: number;
  onChange: (n: number) => void;
  manual?: { disabled: boolean; onInvalidChange: (invalid: boolean) => void };
}) {
  return (
    <div className="pl-stepper">
      <span>{label}</span>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={manual?.disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        <Minus />
      </button>
      {manual ? (
        <ManualWeightInput
          key={label}
          label={label}
          value={value}
          max={max}
          onChange={onChange}
          {...manual}
        />
      ) : (
        <output aria-label={label}>{Math.round(value * 10) / 10}</output>
      )}
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={manual?.disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
      >
        <Plus />
      </button>
    </div>
  );
}
function SetEditor({
  exercise,
  unit,
  last,
  busy,
  onLog,
  label,
}: {
  exercise: ProgramExercise;
  unit: "lb" | "kg";
  last?: { weight_kg: number; reps: number };
  busy: boolean;
  onLog: (weightKg: number, value: number, rpe: number) => void;
  label: string;
}) {
  const prescription = target(exercise.reps);
  const [weightKg, setWeightKg] = useState(last?.weight_kg || 0),
    [value, setValue] = useState(
      prescription.kind === "reps"
        ? last?.reps || prescription.value
        : prescription.value,
    ),
    [rpe, setRpe] = useState(7),
    [weightInvalid, setWeightInvalid] = useState(false);
  const factor = unit === "lb" ? 2.2046226218 : 1;
  return (
    <div className="pl-set-editor">
      <div className="pl-targets">
        <div>
          <small>Target</small>
          <strong>
            {exercise.reps}
            {prescription.kind === "reps" ? " reps" : ""}
          </strong>
        </div>
        <div>
          <small>Then rest</small>
          <strong>{exercise.restSeconds}s</strong>
        </div>
      </div>
      <Stepper
        label={`Weight (${unit})`}
        value={weightKg * factor}
        step={unit === "lb" ? 5 : 2.5}
        max={1000 * factor}
        onChange={(n) => setWeightKg(n / factor)}
        manual={{ disabled: busy, onInvalidChange: setWeightInvalid }}
      />
      <Stepper
        label={prescription.label}
        value={value}
        step={prescription.step}
        min={1}
        max={
          prescription.kind === "reps"
            ? 1000
            : prescription.kind === "duration"
              ? 86400
              : 100000
        }
        onChange={setValue}
      />
      <fieldset className="pl-rpe">
        <legend>Effort · RPE</legend>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            type="button"
            key={n}
            aria-pressed={rpe === n}
            aria-label={`RPE ${n}`}
            disabled={busy}
            className={rpe === n ? "selected" : ""}
            onClick={() => setRpe(n)}
          >
            {n}
          </button>
        ))}
      </fieldset>
      <button
        className="pl-btn pl-log"
        disabled={busy || weightInvalid}
        onClick={() => onLog(weightKg, value, rpe)}
      >
        {busy ? "Saving…" : label}
      </button>
    </div>
  );
}
export function ProgramDetail({
  programId,
  initialDay = 0,
}: {
  programId: string;
  initialDay?: number;
}) {
  const program = programs.find((p) => p.id === programId)!;
  const { state, error, busy, act, retry } = usePrograms();
  const [day, setDay] = useState(initialDay),
    [logging, setLogging] = useState<{ exercise: number; set: number } | null>(
      null,
    ),
    [confirm, setConfirm] = useState(false);
  const pref = state?.preferences.find((p) => p.program_id === programId),
    session = state?.sessions.find(
      (s) => s.program_id === programId && s.day_index === day,
    );
  const exercises =
      session?.exercises || effectiveExercises(program, day, pref?.swaps),
    selectedDay = program.schedule[day];
  const total = exercises.reduce((n, e) => n + e.sets, 0),
    done = session?.sets.length || 0,
    weekDone =
      state?.sessions.filter(
        (s) => s.program_id === programId && s.completed_at,
      ).length || 0;
  const getSession = async () =>
    session ||
    (await act({ action: "start", programId, day }))?.sessions.find(
      (s) => s.program_id === programId && s.day_index === day,
    );
  const complete = async () => {
    const s = await getSession();
    if (s) await act({ action: "complete", sessionId: s.id });
    setConfirm(false);
  };
  const exportProgram = () =>
    download(
      `${programId}.md`,
      `# ${program.title}\n\n${program.description}\n\n` +
        program.schedule
          .map(
            (d, i) =>
              `## ${d.day}: ${d.title} (${d.duration} min)\n\n` +
              effectiveExercises(program, i, pref?.swaps)
                .map(
                  (e) =>
                    `- ${e.name}: ${e.sets} × ${e.reps}; ${e.equipment}; ${e.restSeconds}s rest\n  ${e.cues.join(" ")}`,
                )
                .join("\n"),
          )
          .join("\n\n"),
    );
  return (
    <main className="pl-page">
      <div className="pl-nav">
        <Link href="/programs" className="pl-btn secondary">
          <ArrowLeft size={17} />
          All programs
        </Link>
        <button className="pl-btn secondary" onClick={exportProgram}>
          <Download size={17} />
          Download program
        </button>
      </div>
      <div className="pl-detail-heading">
        <div>
          <p className="eyebrow">THE FIRSTREP PROGRAM LIBRARY</p>
          <h1>{program.title}</h1>
          <p className="pl-intro">{program.description}</p>
          <div className="pl-chips">
            <span className="pl-tag">
              {program.schedule.length} days / week
            </span>
            <span className="pl-tag">{durationLabel(program)}</span>
            <span className="pl-tag">{program.level}</span>
            <span className="pl-tag">{program.goal}</span>
          </div>
        </div>
        <div className="pl-panel pl-week-progress">
          <div>
            <strong>This week</strong>
            <span>
              {weekDone}/{program.schedule.length} sessions
            </span>
          </div>
          <div className="pl-segments">
            {program.schedule.map((_, i) => (
              <i
                key={i}
                className={
                  state?.sessions.some(
                    (s) =>
                      s.program_id === programId &&
                      s.day_index === i &&
                      s.completed_at,
                  )
                    ? "filled"
                    : ""
                }
              />
            ))}
          </div>
          <small>
            Finish a session to fill a bar. A new week starts Monday.
          </small>
        </div>
      </div>
      <ErrorBox error={error} retry={retry} />
      <div className="pl-day-tabs" aria-label="Program days">
        {program.schedule.map((d, i) => (
          <button
            key={d.day}
            className={i === day ? "selected" : ""}
            aria-pressed={i === day}
            onClick={() => {
              setDay(i);
              setConfirm(false);
              setLogging(null);
              history.replaceState(null, "", `?day=${i + 1}`);
            }}
          >
            <small>
              {d.day}
              {state?.sessions.some(
                (s) =>
                  s.program_id === programId &&
                  s.day_index === i &&
                  s.completed_at,
              ) && <Check size={16} />}
            </small>
            <strong>{d.title}</strong>
            <span>
              {[
                ...new Set(
                  effectiveExercises(program, i, pref?.swaps).map(
                    (e) => e.muscle,
                  ),
                ),
              ].join(" · ")}
            </span>
          </button>
        ))}
      </div>
      <div className="pl-detail-grid">
        <section className="pl-panel pl-exercises">
          <div className="pl-section-heading">
            <div>
              <p className="eyebrow">{selectedDay.day.toUpperCase()}</p>
              <h2>{selectedDay.title}</h2>
            </div>
            <p>Tap an exercise for cues, set logging and swaps</p>
          </div>
          {exercises.map((e, i) => {
            const logged =
              session?.sets.filter((s) => s.exercise_index === i) || [];
            return (
              <details
                className="pl-exercise"
                key={`${day}:${i}:${e.name}`}
                open={i === 0 ? true : undefined}
              >
                <summary>
                  <span className="pl-index">{i + 1}</span>
                  <div className="pl-exercise-name">
                    <strong>{e.name}</strong>
                    <small>
                      {e.equipment} · Rest {e.restSeconds}s
                    </small>
                  </div>
                  <span className="pl-muscle">{e.muscle}</span>
                  <strong className="pl-prescription">
                    {e.sets} × {e.reps}
                  </strong>
                  <small>
                    {logged.length}/{e.sets} sets
                  </small>
                  <ChevronDown size={18} />
                </summary>
                <div className="pl-exercise-expanded">
                  <div>
                    <p className="eyebrow">COACHING CUES</p>
                    <ul>
                      {e.cues.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="eyebrow">LOG SETS</p>
                    <div className="pl-set-buttons">
                      {Array.from({ length: e.sets }, (_, j) => {
                        const saved = logged.find((s) => s.set_index === j);
                        return (
                          <button
                            key={j}
                            disabled={!state || busy || !!saved}
                            title={
                              saved
                                ? `${displayWeight(saved.weight_kg, state!.unit)} ${state!.unit} × ${saved.reps ?? saved.duration_seconds ?? saved.distance_m}`
                                : undefined
                            }
                            className={saved ? "selected" : ""}
                            onClick={() => setLogging({ exercise: i, set: j })}
                          >
                            {saved && <Check size={14} />}Set {j + 1}
                          </button>
                        );
                      })}
                    </div>
                    <small className="pl-muted">
                      {logged.length
                        ? "Saved to your account."
                        : "Enter your actual weight and result."}
                    </small>
                  </div>
                  <div>
                    <p className="eyebrow">SWAP FOR</p>
                    <div className="pl-swaps">
                      {program.schedule[day].exercises[i].alternatives.map(
                        (a, j) => (
                          <button
                            key={a.name}
                            disabled={!state || busy || !!logged.length}
                            aria-pressed={pref?.swaps[`${day}:${i}`] === j}
                            onClick={() =>
                              void act({
                                action: "swap",
                                programId,
                                day,
                                exercise: i,
                                alternative: j,
                              })
                            }
                          >
                            {a.name}
                          </button>
                        ),
                      )}
                      {pref?.swaps[`${day}:${i}`] !== undefined && (
                        <button
                          disabled={busy || !!logged.length}
                          onClick={() =>
                            void act({
                              action: "swap",
                              programId,
                              day,
                              exercise: i,
                              alternative: -1,
                            })
                          }
                        >
                          Restore original
                        </button>
                      )}
                    </div>
                    <small className="pl-muted">
                      {logged.length
                        ? "Swaps lock once a set is saved."
                        : e.alternatives.length
                          ? "Keeps the same sets and target."
                          : "No swaps for this movement."}
                    </small>
                  </div>
                </div>
              </details>
            );
          })}
        </section>
        <aside className="pl-sidebar">
          <div className="pl-panel">
            <div className="pl-stats">
              <div>
                <strong>{selectedDay.duration}</strong>
                <small>minutes</small>
              </div>
              <div>
                <strong>{exercises.length}</strong>
                <small>exercises</small>
              </div>
              <div>
                <strong>{total}</strong>
                <small>working sets</small>
              </div>
            </div>
            <div className="pl-label-line">
              <span>Session progress</span>
              <span>
                {done}/{total} sets
              </span>
            </div>
            <Progress label="Session sets" done={done} total={total} />
            <Link
              className="pl-btn"
              href={`/programs/${programId}/workout/${day + 1}`}
            >
              {session?.completed_at
                ? "View workout"
                : done
                  ? "Resume workout"
                  : "Start workout"}
            </Link>
            <button
              className="pl-btn secondary"
              disabled={!state || busy || !!session?.completed_at}
              onClick={() =>
                done < total ? setConfirm(true) : void complete()
              }
            >
              {session?.completed_at ? "Day complete ✓" : "Mark day complete"}
            </button>
            {confirm && (
              <div className="pl-confirm">
                <p>
                  {done} of {total} sets logged. Mark this day complete?
                  Unlogged sets won’t be added.
                </p>
                <button
                  className="pl-btn"
                  disabled={busy}
                  onClick={() => void complete()}
                >
                  Confirm completion
                </button>
                <button
                  className="pl-btn secondary"
                  onClick={() => setConfirm(false)}
                >
                  Keep training
                </button>
              </div>
            )}
          </div>
          <div className="pl-panel">
            <p className="eyebrow">SETS PER MUSCLE · TODAY</p>
            {muscleSets(exercises).map(([muscle, sets], _, all) => (
              <div className="pl-muscle-bar" key={muscle}>
                <span>{muscle}</span>
                <Progress
                  label={`${muscle} sets`}
                  done={sets}
                  total={Math.max(...all.map((a) => a[1]))}
                />
                <span>{sets}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
      {logging && (
        <ProgramSetDialog onClose={() => setLogging(null)}>
          <button
            autoFocus
            className="pl-close"
            aria-label="Close set logging"
            onClick={() => setLogging(null)}
          >
            <X />
          </button>
          <h2>{exercises[logging.exercise].name}</h2>
          <p>
            Set {logging.set + 1} · {state?.unit || "lb"}
          </p>
          <ErrorBox error={error} />
          <SetEditor
            key={`${day}:${logging.exercise}:${logging.set}`}
            exercise={exercises[logging.exercise]}
            unit={state?.unit || "lb"}
            last={state?.last.find(
              (l) =>
                (l.exercise_id &&
                  l.exercise_id === exercises[logging.exercise].exerciseId) ||
                l.exercise === exercises[logging.exercise].name,
            )}
            busy={busy}
            label={`Save set ${logging.set + 1}`}
            onLog={async (weightKg, value, rpe) => {
              const s = await getSession();
              if (
                s &&
                (await act({
                  action: "log",
                  sessionId: s.id,
                  exercise: logging.exercise,
                  set: logging.set,
                  weightKg,
                  value,
                  rpe,
                }))
              )
                setLogging(null);
            }}
          />
        </ProgramSetDialog>
      )}
      <p className="pl-warmup">
        Warm up before training. These are the original FirstRep routines; adapt
        them to your experience, available equipment, and recovery.
      </p>
      <ProgramFooter />
    </main>
  );
}
export function ProgramWorkout({
  programId,
  day,
}: {
  programId: string;
  day: number;
}) {
  const program = programs.find((p) => p.id === programId)!;
  const { state, error, busy, act, retry } = usePrograms(
      JSON.stringify({ action: "start", programId, day }),
    ),
    [selectedIndex, setIndex] = useState<number | null>(null),
    [chosenSet, setChosenSet] = useState<number | null>(null),
    [deadline, setDeadline] = useState(0),
    [now, setNow] = useState(() => Date.now()),
    [restTotal, setRestTotal] = useState(0);
  const { notice, celebrate } = useExerciseEncouragement();
  const session = state?.sessions.find(
    (s) => s.program_id === programId && s.day_index === day,
  );
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, []);
  if (!state || !session)
    return (
      <main className="pl-workout">
        <Link
          className="pl-btn secondary"
          href={`/programs/${programId}?day=${day + 1}`}
        >
          <ArrowLeft size={18} />
          Program details
        </Link>
        <h1>{program.schedule[day].title}</h1>
        <p className="pl-intro">Loading your workout…</p>
        <ErrorBox error={error} retry={retry} />
      </main>
    );
  const pendingIndex = session.exercises.findIndex(
    (e, i) =>
      session.sets.filter((s) => s.exercise_index === i).length < e.sets,
  );
  const index = selectedIndex ?? Math.max(0, pendingIndex);
  const total = session.exercises.reduce((n, e) => n + e.sets, 0);
  if (session.completed_at)
    return (
      <main className="pl-workout pl-completion">
        <div className="pl-complete-check">
          <Check size={44} />
        </div>
        <p className="eyebrow">WORKOUT COMPLETE</p>
        <h1>{program.schedule[day].title}</h1>
        <div className="pl-panel">
          <strong className="pl-total-sets">{session.sets.length}</strong>
          <p>sets logged</p>
          <p className="pl-muted">
            {session.sets.length === total
              ? "Every planned set is saved."
              : `${session.sets.length} of ${total} planned sets saved.`}
          </p>
        </div>
        <Link className="pl-btn" href={`/programs/${programId}?day=${day + 1}`}>
          Back to program
        </Link>
        {day + 1 < program.schedule.length && (
          <Link
            className="pl-btn secondary"
            href={`/programs/${programId}/workout/${day + 2}`}
          >
            Next day · {program.schedule[day + 1].title}
          </Link>
        )}
        <Link className="pl-btn secondary" href="/#workout">
          View workout log
        </Link>
        <ProgramFooter />
      </main>
    );
  const exercise = session.exercises[index],
    logged = session.sets.filter((s) => s.exercise_index === index),
    firstPending = Array.from({ length: exercise.sets }, (_, i) => i).find(
      (i) => !logged.some((s) => s.set_index === i),
    ),
    set =
      chosenSet !== null && !logged.some((s) => s.set_index === chosenSet)
        ? chosenSet
        : firstPending;
  const rest = Math.max(0, Math.ceil((deadline - now) / 1000));
  const move = (next: number) => {
    if (next > index)
      celebrate(
        session.exercises.filter(
          (e, i) =>
            session.sets.filter((s) => s.exercise_index === i).length ===
            e.sets,
        ).length,
        session.exercises.length,
      );
    setIndex(next);
    setChosenSet(null);
  };
  return (
    <main className="pl-workout">
      <header className="pl-workout-header">
        <Link
          className="pl-exit"
          href={`/programs/${programId}?day=${day + 1}`}
          aria-label="Exit workout"
        >
          <X />
        </Link>
        <strong>
          {program.schedule[day].day} · {program.schedule[day].title}
        </strong>
        <span>
          {index + 1}/{session.exercises.length}
        </span>
      </header>
      <div className="pl-segments">
        {session.exercises.map((e, i) => (
          <button
            key={i}
            aria-label={`Go to exercise ${i + 1}: ${e.name}`}
            aria-current={index === i ? "step" : undefined}
            onClick={() => move(i)}
          >
            <i
              className={
                i === index ||
                session.sets.filter((s) => s.exercise_index === i).length ===
                  e.sets
                  ? "filled"
                  : ""
              }
            />
          </button>
        ))}
      </div>
      <p className="eyebrow">
        EXERCISE {index + 1} OF {session.exercises.length}
      </p>
      <h1>{exercise.name}</h1>
      <p className="pl-intro">
        {exercise.muscle} · {exercise.equipment}
      </p>
      <ErrorBox error={error} />
      <div className="pl-mode-sets">
        {Array.from({ length: exercise.sets }, (_, i) => {
          const done = logged.some((s) => s.set_index === i);
          return (
            <button
              key={i}
              className={done || i === set ? "selected" : ""}
              disabled={done}
              aria-pressed={i === set}
              onClick={() => setChosenSet(i)}
            >
              {done && <Check size={17} />}Set {i + 1}
            </button>
          );
        })}
      </div>
      {rest > 0 && (
        <div className="pl-rest" role="timer">
          <div
            className="pl-rest-ring"
            style={{
              background: `conic-gradient(var(--pl-orange) ${Math.min(rest / restTotal, 1) * 360}deg, #303035 0deg)`,
            }}
          >
            <span>{clock(rest)}</span>
          </div>
          <div>
            <small>Rest</small>
            <strong>{clock(rest)}</strong>
          </div>
          <button
            onClick={() => {
              setDeadline((d) => d + 15000);
              setRestTotal((t) => t + 15);
            }}
          >
            +15s
          </button>
          <button onClick={() => setDeadline(0)}>Skip</button>
        </div>
      )}
      {set !== undefined ? (
        <SetEditor
          key={`${index}:${set}`}
          exercise={exercise}
          unit={state.unit}
          last={state.last.find(
            (l) =>
              (l.exercise_id && l.exercise_id === exercise.exerciseId) ||
              l.exercise === exercise.name,
          )}
          busy={busy}
          label={`Log set ${set + 1}`}
          onLog={async (weightKg, value, rpe) => {
            const saved = await act({
              action: "log",
              sessionId: session.id,
              exercise: index,
              set,
              weightKg,
              value,
              rpe,
            });
            if (saved) {
              setIndex(index);
              setChosenSet(null);
              setRestTotal(exercise.restSeconds);
              setDeadline(Date.now() + exercise.restSeconds * 1000);
              setNow(Date.now());
              if (
                !window.matchMedia("(prefers-reduced-motion: reduce)").matches
              )
                navigator.vibrate?.(20);
            }
          }}
        />
      ) : (
        <div className="pl-panel">
          <h2>Exercise complete ✓</h2>
          <p>All {exercise.sets} sets saved.</p>
          {index + 1 < session.exercises.length && (
            <button className="pl-btn" onClick={() => move(index + 1)}>
              Next exercise
            </button>
          )}
        </div>
      )}
      <div className="pl-up-next">
        <small>UP NEXT</small>
        <strong>
          {session.exercises[index + 1]?.name || "Workout complete"}
        </strong>
      </div>
      <p className="pl-muted">
        {session.sets.length} of {total} sets saved · You can leave and resume
        this week.
      </p>
      <ProgramFooter />
      <WorkoutEncouragement notice={notice} />
    </main>
  );
}
