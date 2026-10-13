"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { WorkoutFullscreen } from "./workout-fullscreen";
import {
  Check,
  Download,
  Flame,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Star,
  Trophy,
  X,
} from "lucide-react";
import { useStore } from "./store";
import { WorkoutQuickLog } from "./workout-quick-log";
import { WorkoutHistoryTools } from "./trackers";
import {
  WorkoutCardButton,
  NewPRButton,
  PRCardEditor,
} from "./workout-share-cards";
import { WorkoutSetup, LiveSession } from "./workout-live";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { api, download, errorText } from "@/lib/client";
import { csvExport, today, type Entry } from "@/lib/tracking";
import {
  cardDate,
  cardNumber,
  cardWeight,
  type CardUnit,
  type PRCardData,
} from "@/lib/share-cards";
import {
  reconcileFinishedWorkout,
  groupSessions,
  liftRecords,
  muscleColors,
  nextTarget,
  readSessionNote,
  rowTime,
  sessionNotes,
  streakDays,
  validLive,
  weekDates,
  weeklySessions,
  feelings,
  type Feeling,
  type CatalogLift,
  type LiftGroup,
  type LiftRecord,
  type LiveWorkout,
  type Muscle,
} from "@/lib/workout-session";
function displayWeight(kg: number, unit: CardUnit, bodyweight = false) {
  return (bodyweight ? "+" : "") + cardNumber(cardWeight(kg, unit));
}
function UnitToggle({
  unit,
  onChange,
}: {
  unit: CardUnit;
  onChange: (unit: CardUnit) => void;
}) {
  return (
    <div className="ws-units" aria-label="Workout display unit">
      {(["lb", "kg"] as const).map((value) => (
        <button
          key={value}
          aria-pressed={unit === value}
          onClick={() => onChange(value)}
        >
          {value}
        </button>
      ))}
    </div>
  );
}
function prData(record: LiftRecord, unit: CardUnit): PRCardData {
  const previous =
    record.previous &&
    Number(record.previous.reps) === Number(record.row.reps) &&
    Number(record.previous.weight_kg) < Number(record.row.weight_kg)
      ? cardWeight(Number(record.previous.weight_kg), unit)
      : undefined;
  return {
    date: String(record.row.date),
    exercise: record.name,
    reps: Number(record.row.reps),
    weight:
      Math.round(cardWeight(Number(record.row.weight_kg), unit) * 1e6) / 1e6,
    unit,
    bodyweight: record.bodyweight,
    ...(previous === undefined ? {} : { previous }),
  };
}
function CompactNumber({ value }: { value: number }) {
  return (
    <>
      {new Intl.NumberFormat("en-US", {
        notation: value >= 10000 ? "compact" : "standard",
        maximumFractionDigits: 1,
      }).format(value)}
    </>
  );
}
function ExerciseCard({
  group,
  unit,
  maxVolume,
  award,
  onManage,
  onPR,
}: {
  group: LiftGroup;
  unit: CardUnit;
  maxVolume: number;
  award?: LiftRecord;
  onManage: () => void;
  onPR: (record: LiftRecord) => void;
}) {
  const chips = group.rows.flatMap((row) =>
    Number(row.sets) <= 12
      ? Array.from({ length: Number(row.sets) }, (_, i) => ({
          row,
          key: row.id + "-" + i,
          count: 1,
        }))
      : [{ row, key: row.id, count: Number(row.sets) }],
  );
  return (
    <article className="ws-exercise-card">
      <div className="ws-group-heading">
        <div>
          <h3>{group.name}</h3>
          <p>
            {group.muscle} · {group.sets} sets{" "}
            {award && (
              <button
                className={
                  "ws-badge " + (award.badge === "PR" ? "orange" : "baseline")
                }
                title={
                  award.badge === "PR"
                    ? "New estimated 1RM best"
                    : "First recorded session for this lift"
                }
                onClick={() =>
                  award.badge === "PR" ? onPR(award) : onManage()
                }
              >
                {award.badge === "PR" && <Trophy size={13} />} {award.badge}
              </button>
            )}
          </p>
        </div>
        <strong>
          {cardNumber(cardWeight(group.volumeKg, unit))} <span>{unit}</span>
        </strong>
      </div>
      <div className="ws-set-chips">
        {chips.map(({ row, key, count }, i) => (
          <span
            key={key}
            aria-label={
              "Set " +
              (i + 1) +
              ": " +
              displayWeight(Number(row.weight_kg), unit, group.bodyweight) +
              " " +
              unit +
              " for " +
              row.reps +
              " reps"
            }
          >
            {group.bodyweight && Number(row.weight_kg) === 0
              ? "BW"
              : displayWeight(
                  Number(row.weight_kg),
                  unit,
                  group.bodyweight,
                )}{" "}
            × {row.reps}
            {count > 1 && <small> · {count} sets</small>}
          </span>
        ))}
      </div>
      <div
        className="ws-volume-track"
        aria-label={group.muscle + " training volume"}
      >
        <span
          style={{
            width: (maxVolume ? (group.volumeKg / maxVolume) * 100 : 0) + "%",
            background: muscleColors[group.muscle],
          }}
        />
      </div>
      <button className="ws-manage-lift" onClick={onManage}>
        <Pencil size={14} /> Manage entries
      </button>
    </article>
  );
}
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now(),
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animate = (now: number) => {
      const t = reduced ? 1 : Math.min(1, (now - start) / 750);
      setShown(value * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{cardNumber(shown)}</>;
}
type Recap = {
  id: string;
  name: string;
  date: string;
  rows: Entry[];
  awards: LiftRecord[];
};
function SessionRecap({
  recap,
  catalog,
  unit,
  onDone,
  onFeeling,
  onPR,
  busy,
  error,
}: {
  recap: Recap;
  catalog: CatalogLift[];
  unit: CardUnit;
  onDone: () => void;
  onFeeling: (feeling: Feeling) => void;
  onPR: (record: LiftRecord) => void;
  busy: boolean;
  error: string;
}) {
  const summary = useMemo(
    () => groupSessions(recap.rows, catalog)[0],
    [recap.rows, catalog],
  );
  const distribution = useMemo(
    () =>
      summary.groups.reduce((map, g) => {
        map.set(g.muscle, (map.get(g.muscle) || 0) + g.volumeKg);
        return map;
      }, new Map<Muscle, number>()),
    [summary],
  );
  const chosen = readSessionNote(recap.rows[0].notes)?.feeling,
    heaviest = recap.rows.reduce((a, b) =>
      Number(b.weight_kg) > Number(a.weight_kg) ? b : a,
    ),
    baselineCount = recap.awards.filter((a) => a.badge === "Baseline").length,
    prs = recap.awards.filter((a) => a.badge === "PR");
  const comparison =
    summary.volumeKg >= 1400
      ? "About the weight of " +
        Math.round(summary.volumeKg / 1400) +
        " compact cars"
      : summary.volumeKg > 0
        ? "About the weight of " +
          Math.max(1, Math.round(summary.volumeKg / 20)) +
          " packed backpacks"
        : "Bodyweight work adds up, too.";
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <WorkoutFullscreen
      className="ws-recap"
      label="Workout session recap"
      onClose={onDone}
      busy={busy}
    >
      <div className="ws-recap-content">
        <div className="ws-complete-icon">
          <Check size={32} />
        </div>
        <p className="eyebrow">WORKOUT COMPLETE · {cardDate(recap.date)}</p>
        <h1>{recap.name}</h1>
        <article className="ws-recap-volume">
          <strong>
            <CountUp value={cardWeight(summary.volumeKg, unit)} />
          </strong>
          <p>{unit} moved this workout</p>
          <div className="ws-comparison">{comparison}</div>
          <div className="ws-recap-stats">
            <div>
              <b>{summary.sets}</b>
              <span>sets</span>
            </div>
            <div>
              <b>{summary.groups.length}</b>
              <span>exercises</span>
            </div>
            <div>
              <b>{summary.reps}</b>
              <span>reps</span>
            </div>
          </div>
        </article>
        <article className="ws-recap-distribution">
          <h2>Where the work went</h2>
          <div className="ws-stacked-bar" aria-label="Volume by muscle group">
            {[...distribution].map(([muscle, volume]) => (
              <span
                key={muscle}
                title={
                  muscle +
                  ": " +
                  cardNumber(cardWeight(volume, unit)) +
                  " " +
                  unit
                }
                style={{
                  width:
                    (summary.volumeKg ? (volume / summary.volumeKg) * 100 : 0) +
                    "%",
                  background: muscleColors[muscle],
                }}
              />
            ))}
          </div>
          <div className="ws-volume-legend">
            {[...distribution].map(([muscle, volume]) => (
              <div key={muscle}>
                <i style={{ background: muscleColors[muscle] }} />
                <span>{muscle}</span>
                <b>
                  {cardNumber(cardWeight(volume, unit))} {unit}
                </b>
              </div>
            ))}
          </div>
        </article>
        <article className="ws-highlight">
          <Trophy />
          <div>
            <h3>Heaviest set</h3>
            <p>
              {heaviest.exercise} ·{" "}
              {cardNumber(cardWeight(Number(heaviest.weight_kg), unit))} {unit}{" "}
              × {heaviest.reps}
            </p>
          </div>
        </article>
        {baselineCount > 0 && (
          <article className="ws-highlight baseline">
            <Star />
            <div>
              <h3>
                {baselineCount} {baselineCount === 1 ? "baseline" : "baselines"}{" "}
                set
              </h3>
              <p>
                Your first recorded session for these lifts. Your next session
                has a starting point.
              </p>
            </div>
          </article>
        )}
        {prs.map((record) => (
          <button
            key={record.key}
            className="ws-highlight ws-pr-highlight"
            onClick={() => onPR(record)}
          >
            <Trophy />
            <span>
              <b>New PR · {record.name}</b>
              <small>
                {displayWeight(
                  Number(record.row.weight_kg),
                  unit,
                  record.bodyweight,
                )}{" "}
                {unit} × {record.row.reps} · Create PR card
              </small>
            </span>
          </button>
        ))}
        <section className="ws-feeling">
          <h2>How did it feel?</h2>
          <div>
            {feelings.map((feeling) => (
              <button
                key={feeling}
                aria-pressed={chosen === feeling}
                disabled={busy}
                onClick={() => onFeeling(feeling)}
              >
                {feeling}
              </button>
            ))}
          </div>
          <p className="muted">
            {chosen
              ? "Saved to session notes: " + chosen
              : "Choose a feeling to save it with your session."}
          </p>
        </section>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <p className="ws-footer">
          Volume counts external or added weight only. Comparisons are
          approximate, using 1,400 kg per car or 20 kg per backpack.
          <br />
          Educational tools. Not medical advice.
        </p>
        <div className="ws-recap-actions">
          <button
            className="ws-button secondary"
            disabled={busy}
            onClick={onDone}
          >
            Done
          </button>
          <WorkoutCardButton
            rows={recap.rows}
            initialDate={recap.date}
            initialUnit={unit}
            initialTitle={recap.name}
            buttonLabel="Share workout card"
            buttonClassName="ws-button primary"
          />
        </div>
      </div>
    </WorkoutFullscreen>
  );
}
export function WorkoutLog() {
  const { logs, status, save, busy, reload } = useStore();
  const [catalog, setCatalog] = useState<CatalogLift[]>([]),
    [catalogError, setCatalogError] = useState("");
  const [unit, setUnit] = useState<CardUnit>(
    () =>
      readSessionNote(
        [...logs.workout]
          .sort((a, b) => rowTime(a).localeCompare(rowTime(b)))
          .at(-1)?.notes,
      )?.unit || (status.user?.weightUnit === "lb" ? "lb" : "kg"),
  );
  const [view, setView] = useState<"sessions" | "progress">("sessions"),
    [filter, setFilter] = useState<Muscle | "All">("All"),
    [quick, setQuick] = useState(false),
    [manage, setManage] = useState(false),
    [setup, setSetup] = useState(false),
    [live, setLive] = useState<LiveWorkout | null>(null),
    [liveOpen, setLiveOpen] = useState(false),
    [recap, setRecap] = useState<Recap | null>(null),
    [activePR, setActivePR] = useState<PRCardData | null>(null),
    [pendingPR, setPendingPR] = useState<PRCardData | null>(null),
    [sessionError, setSessionError] = useState("");
  const [goal, setGoal] = useState(3),
    [goalDraft, setGoalDraft] = useState("3"),
    [goalEdit, setGoalEdit] = useState(false),
    [goalBusy, setGoalBusy] = useState(false),
    [goalError, setGoalError] = useState("");
  const draftKey = "firstrep.live-workout.v1." + (status.user?.id || "guest"),
    finishing = useRef(false);
  const sessions = useMemo(
      () => groupSessions(logs.workout, catalog),
      [logs.workout, catalog],
    ),
    progress = useMemo(
      () => liftRecords(logs.workout, catalog),
      [logs.workout, catalog],
    );
  const week = weekDates(today()),
    activeDays = new Set(logs.workout.map((r) => String(r.date))),
    weekly = weeklySessions(logs.workout, today()),
    streak = streakDays(logs.workout, today());
  useEffect(() => {
    let active = true;
    api<{ exercises: CatalogLift[] }>("exercises?limit=1000")
      .then((data) => {
        if (active) {
          setCatalog(data.exercises);
          setCatalogError("");
        }
      })
      .catch((err) => {
        if (active) setCatalogError(errorText(err));
      });
    (status.user
      ? api<{ weeklyWorkoutGoal: number }>("workout-settings")
      : Promise.resolve({
          weeklyWorkoutGoal:
            Number(sessionStorage.getItem(draftKey + ".goal")) || 3,
        })
    )
      .then((data) => {
        if (active) {
          setGoal(data.weeklyWorkoutGoal);
          setGoalDraft(String(data.weeklyWorkoutGoal));
        }
      })
      .catch((err) => {
        if (active) setGoalError(errorText(err));
      });
    queueMicrotask(() => {
      if (!active) return;
      try {
        const raw = sessionStorage.getItem(draftKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (validLive(parsed)) setLive(parsed);
          else sessionStorage.removeItem(draftKey);
        }
      } catch {
        setSessionError(
          "The previous draft could not be restored. Your saved workout log is unchanged.",
        );
      }
    });
    return () => {
      active = false;
    };
  }, [draftKey, status.user]);
  useEffect(() => {
    if (!live) return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(live));
    } catch {
      queueMicrotask(() =>
        setSessionError(
          "Draft backup is unavailable in this browser. Finish your session before closing the page.",
        ),
      );
    }
  }, [live, draftKey]);
  useEffect(() => {
    if (!live) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [live]);
  function newAwards(rows: Entry[], previous: Entry[]) {
    const ids = new Set(rows.map((r) => r.id));
    return [
      ...liftRecords([...previous, ...rows], catalog).awards.values(),
    ].filter((r) => ids.has(r.row.id));
  }
  function quickSaved(rows: Entry[], previous: Entry[]) {
    const awards = newAwards(rows, previous),
      pr = awards.find((a) => a.badge === "PR");
    const chosen = readSessionNote(rows[0].notes)?.unit || unit;
    setUnit(chosen);
    if (pr) setActivePR(prData(pr, chosen));
  }
  async function finish() {
    if (!live || finishing.current) return;
    finishing.current = true;
    setSessionError("");
    try {
      const { rows, additions, previous } = reconcileFinishedWorkout(
        live,
        logs.workout,
        new Date().toISOString(),
      );
      if (!rows.length) return;
      const awards = newAwards(rows, previous);
      if (
        !additions.length ||
        (await save("workout", [...logs.workout, ...additions]))
      ) {
        try {
          sessionStorage.removeItem(draftKey);
        } catch {}
        setRecap({
          id: live.id,
          name: live.name,
          date: live.date,
          rows,
          awards,
        });
        setUnit(live.unit);
        setLive(null);
        setLiveOpen(false);
        const pr = awards.find((r) => r.badge === "PR");
        if (pr) setPendingPR(prData(pr, live.unit));
      } else {
        setSessionError(
          "Your workout could not be saved. Your draft is kept. Check the connection and try Finish workout again.",
        );
      }
    } catch (err) {
      setSessionError(errorText(err));
    } finally {
      finishing.current = false;
    }
  }
  // Let the recap portal finish mounting before opening its child card dialog.
  // Mounting two modal portals together would make them hide each other.
  useEffect(() => {
    if (!recap || !pendingPR) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        setActivePR(pendingPR);
        setPendingPR(null);
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [recap, pendingPR]);
  async function saveFeeling(feeling: Feeling) {
    if (!recap) return;
    setSessionError("");
    const ids = new Set(recap.rows.map((r) => r.id));
    const updated = logs.workout.map((row) => {
      const note = readSessionNote(row.notes);
      return ids.has(row.id) && note
        ? { ...row, notes: sessionNotes(row.notes, { ...note, feeling }) }
        : row;
    });
    if (await save("workout", updated))
      setRecap({ ...recap, rows: updated.filter((r) => ids.has(r.id)) });
    else setSessionError("Your feeling could not be saved. Please try again.");
  }
  async function saveGoal() {
    const value = Number(goalDraft);
    if (!Number.isInteger(value) || value < 1 || value > 14) {
      setGoalError("Choose a weekly goal from 1 to 14 sessions.");
      return;
    }
    setGoalBusy(true);
    setGoalError("");
    try {
      const data = status.user
        ? await api<{ weeklyWorkoutGoal: number }>(
            "workout-settings",
            { weeklyWorkoutGoal: value },
            "PATCH",
          )
        : { weeklyWorkoutGoal: value };
      if (!status.user)
        sessionStorage.setItem(draftKey + ".goal", String(value));
      setGoal(data.weeklyWorkoutGoal);
      setGoalEdit(false);
    } catch (err) {
      setGoalError(errorText(err));
    } finally {
      setGoalBusy(false);
    }
  }
  const muscleList = [
    ...new Set(sessions.flatMap((s) => s.groups.map((g) => g.muscle))),
  ];
  return (
    <div className="ws-workout-page">
      <header className="ws-page-header">
        <div>
          <p className="eyebrow">TRAIN WITH INTENTION</p>
          <h1>Every rep counts.</h1>
          <p className="muted">
            Start a session, find your rhythm, and see your strength take shape.
          </p>
        </div>
        <div className="row wrap">
          {live ? (
            <button
              className="ws-button primary"
              onClick={() => setLiveOpen(true)}
            >
              <Play size={18} /> Resume workout
            </button>
          ) : (
            <button
              className="ws-button primary"
              onClick={() => setSetup(true)}
            >
              <Play size={18} /> Start workout
            </button>
          )}
          <button
            className="ws-button secondary"
            aria-expanded={quick}
            onClick={() => setQuick(!quick)}
          >
            <Plus size={18} /> Log an exercise
          </button>
        </div>
      </header>
      <section className="ws-week-card">
        <div className="ws-week-top">
          <h2>This week</h2>
          <button
            className="ws-text-button"
            aria-label="Edit weekly session goal"
            onClick={() => setGoalEdit(!goalEdit)}
          >
            <b>
              {weekly} of {goal}
            </b>{" "}
            sessions <Pencil size={14} />
          </button>
        </div>
        <div className="ws-week-strip">
          {week.map((date, i) => (
            <button
              key={date}
              disabled={!activeDays.has(date)}
              className={
                (activeDays.has(date) ? "filled " : "") +
                (date === today() ? "today" : "")
              }
              aria-label={
                date +
                (activeDays.has(date) ? " · workout logged" : " · no workout")
              }
              onClick={() => {
                setView("sessions");
                setFilter("All");
                requestAnimationFrame(() =>
                  document
                    .getElementById("workout-day-" + date)
                    ?.scrollIntoView({
                      behavior: window.matchMedia(
                        "(prefers-reduced-motion: reduce)",
                      ).matches
                        ? "instant"
                        : "smooth",
                      block: "start",
                    }),
                );
              }}
            >
              <span>{["M", "T", "W", "T", "F", "S", "S"][i]}</span>
              <b>{Number(date.slice(-2))}</b>
            </button>
          ))}
        </div>
        {streak > 0 && (
          <p className="ws-streak">
            <Flame size={17} />
            {streak}-day streak · Keep showing up.
          </p>
        )}
        {goalEdit && (
          <form
            className="ws-goal-editor"
            onSubmit={(e) => {
              e.preventDefault();
              void saveGoal();
            }}
          >
            <label>
              Weekly session goal
              <input
                type="number"
                min={1}
                max={14}
                required
                value={goalDraft}
                onChange={(e) => setGoalDraft(e.target.value)}
              />
            </label>
            <button className="ws-button primary" disabled={goalBusy}>
              Save goal
            </button>
          </form>
        )}
        {goalError && (
          <p className="error-text" role="alert">
            {goalError}
          </p>
        )}
      </section>
      {quick && (
        <div className="ws-quick-log">
          <WorkoutQuickLog onSaved={quickSaved} initialUnit={unit} />
        </div>
      )}
      <nav className="ws-view-tabs" aria-label="Workout log views">
        <button
          aria-pressed={view === "sessions"}
          onClick={() => setView("sessions")}
        >
          Sessions
        </button>
        <button
          aria-pressed={view === "progress"}
          onClick={() => setView("progress")}
        >
          Baselines & progress
        </button>
      </nav>
      {catalogError && (
        <p className="muted" role="status">
          Muscle details are temporarily unavailable. Your saved sets are still
          shown.
        </p>
      )}
      {view === "sessions" ? (
        <>
          <div className="ws-muscle-filters" aria-label="Filter muscle group">
            {(["All", ...muscleList] as const).map((muscle) => (
              <button
                key={muscle}
                aria-pressed={filter === muscle}
                onClick={() => setFilter(muscle)}
              >
                {muscle}
              </button>
            ))}
            <UnitToggle unit={unit} onChange={setUnit} />
          </div>
          {!sessions.length && (
            <section className="ws-empty">
              <h2>Your first session starts the story.</h2>
              <p>
                Choose Start workout to log each set as you go, or Log an
                exercise to add a completed lift.
              </p>
            </section>
          )}
          {sessions.map((session) => {
            const groups = session.groups.filter(
              (g) => filter === "All" || g.muscle === filter,
            );
            if (!groups.length) return null;
            const volume = groups.reduce((n, g) => n + g.volumeKg, 0),
              sets = groups.reduce((n, g) => n + g.sets, 0),
              max = Math.max(...groups.map((g) => g.volumeKg));
            return (
              <section
                key={session.date}
                className="ws-day-session"
                id={"workout-day-" + session.date}
              >
                <div className="ws-session-heading">
                  <div>
                    <p className="eyebrow">{cardDate(session.date)}</p>
                    <h2>
                      {session.date === today()
                        ? "Today’s session"
                        : "Logged session"}
                    </h2>
                    {[
                      ...new Map(
                        session.rows.map((r) => {
                          const note = readSessionNote(r.notes);
                          return [note?.id, note];
                        }),
                      ).values(),
                    ]
                      .filter((note) => note?.feeling)
                      .map((note) => (
                        <p className="muted" key={note!.id}>
                          {note!.name} · Felt {note!.feeling}
                        </p>
                      ))}
                  </div>
                </div>
                <div className="ws-session-stats">
                  <div>
                    <strong>{sets}</strong>
                    <span>sets</span>
                  </div>
                  <div>
                    <strong>{groups.length}</strong>
                    <span>exercises</span>
                  </div>
                  <div>
                    <strong>
                      <CompactNumber value={cardWeight(volume, unit)} />
                    </strong>
                    <span>
                      {unit} moved{filter !== "All" ? " · " + filter : ""}
                    </span>
                  </div>
                </div>
                <div className="ws-day-exercises">
                  {groups.map((group) => {
                    const awards = [...progress.awards.values()].filter(
                        (a) =>
                          a.key === group.key && a.row.date === session.date,
                      ),
                      award = awards.find((a) => a.badge === "PR") || awards[0];
                    return (
                      <ExerciseCard
                        key={group.key}
                        group={group}
                        unit={unit}
                        maxVolume={max}
                        award={award}
                        onManage={() => setManage(true)}
                        onPR={(r) => setActivePR(prData(r, unit))}
                      />
                    );
                  })}
                </div>
                <div className="ws-session-actions">
                  <button
                    className="ws-button secondary"
                    onClick={() =>
                      download(
                        "workout_log_" + session.date + ".csv",
                        csvExport("workout", session.rows),
                        "text/csv",
                      )
                    }
                  >
                    <Download size={17} /> Export CSV
                  </button>
                  <WorkoutCardButton
                    rows={session.rows}
                    initialDate={session.date}
                    initialUnit={unit}
                    buttonLabel="Share workout card"
                    buttonClassName="ws-button primary"
                  />
                </div>
              </section>
            );
          })}
        </>
      ) : (
        <section className="ws-progress-view">
          <div className="ws-progress-heading">
            <div>
              <p className="eyebrow">YOUR PROGRESS</p>
              <h2>Every rep is a beginning.</h2>
            </div>
            <UnitToggle unit={unit} onChange={setUnit} />
          </div>
          <div className="ws-record-heading">
            <h3>Baselines · est. 1RM</h3>
            <span>{progress.records.length} lifts</span>
          </div>
          {progress.records.map((record) => {
            const target = nextTarget(record);
            return (
              <article className="ws-record-card" key={record.key}>
                <div>
                  <h3>
                    {record.name}{" "}
                    <span
                      className={
                        "ws-badge " +
                        (record.badge === "PR" ? "orange" : "baseline")
                      }
                    >
                      {record.badge}
                    </span>
                  </h3>
                  <p>
                    Best{" "}
                    {displayWeight(
                      Number(record.row.weight_kg),
                      unit,
                      record.bodyweight,
                    )}{" "}
                    × {record.row.reps} · next{" "}
                    {displayWeight(target.weightKg, unit, record.bodyweight)} ×{" "}
                    {target.reps}
                  </p>
                  {record.bodyweight && (
                    <small>
                      Added-load estimate; body mass is not included.
                    </small>
                  )}
                </div>
                <div className="ws-record-number">
                  <strong>
                    {record.bodyweight && record.estimate === 0
                      ? "—"
                      : displayWeight(record.estimate, unit, record.bodyweight)}
                  </strong>
                  <span>{unit}</span>
                </div>
              </article>
            );
          })}
          {!progress.records.length && (
            <p className="muted">
              Your first logged lift sets a baseline. Finish a session to see it
              here.
            </p>
          )}
          <p className="ws-footer">
            Est. 1RM uses the Epley formula: weight × (1 + reps ÷ 30). Targets
            are suggestions; choose a load and rep count that suit you.
            <br />
            Educational tools. Not medical advice.
          </p>
        </section>
      )}
      <div className="ws-log-tools">
        <button
          className="ws-button secondary"
          disabled={busy}
          onClick={() => void reload()}
        >
          <RefreshCw size={16} /> Reload saved logs
        </button>
        <button className="ws-button secondary" onClick={() => setManage(true)}>
          Manage entries / restore CSV
        </button>
        <NewPRButton initialDate={today()} initialUnit={unit} />
      </div>
      {sessionError && !liveOpen && (
        <p className="error-text" role="alert">
          {sessionError}
        </p>
      )}
      <p className="ws-footer">
        Volume includes external or added weight only. Educational tools. Not
        medical advice.
      </p>
      {setup && (
        <WorkoutSetup
          catalog={catalog}
          history={logs.workout}
          unit={unit}
          onClose={() => setSetup(false)}
          onStart={(value) => {
            setLive(value);
            setSetup(false);
            setLiveOpen(true);
            setSessionError("");
          }}
        />
      )}
      {live && liveOpen && (
        <LiveSession
          live={live}
          history={logs.workout}
          catalog={catalog}
          records={progress.records}
          onChange={setLive}
          onBack={() => setLiveOpen(false)}
          onDiscard={() => {
            sessionStorage.removeItem(draftKey);
            setLive(null);
            setLiveOpen(false);
            setSessionError("");
          }}
          onFinish={() => void finish()}
          busy={busy}
          error={sessionError}
        />
      )}
      {recap && (
        <SessionRecap
          recap={recap}
          catalog={catalog}
          unit={unit}
          onDone={() => setRecap(null)}
          onFeeling={(feeling) => void saveFeeling(feeling)}
          onPR={(record) => setActivePR(prData(record, unit))}
          busy={busy}
          error={sessionError}
        />
      )}
      {activePR && (
        <PRCardEditor data={activePR} onClose={() => setActivePR(null)} />
      )}
      {manage && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setManage(false);
          }}
        >
          <DialogContent
            className="ws-manage-dialog"
            overlayClassName="ws-overlay"
          >
            <div className="section-top">
              <div>
                <DialogTitle>Manage workout entries</DialogTitle>
                <DialogDescription>
                  Edit or remove individual entries, or restore a CSV. Weights
                  are stored in kilograms.
                </DialogDescription>
              </div>
              <button
                className="ws-icon"
                aria-label="Close entry manager"
                onClick={() => setManage(false)}
              >
                <X size={20} />
              </button>
            </div>
            <WorkoutHistoryTools />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
