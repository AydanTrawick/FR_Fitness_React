"use client";
/* Loading states synchronize fetches and browser preferences. */
/* eslint-disable react-hooks/set-state-in-effect */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  Clock3,
  ExternalLink,
  GripVertical,
  LayoutGrid,
  List,
  Minus,
  Plus,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Field } from "../ui";
import { useStore } from "../store";
import { api, errorText } from "@/lib/client";
import {
  SESSION,
  GROUPS,
  SPLIT_GROUPS,
  SPLIT_NAMES,
  type MuscleGroup,
  type Split,
} from "@/lib/session/config";
import {
  coverage,
  emptyDraft,
  flags,
  makeExercise,
  matchesGroup,
  repBased,
  stats,
  type DraftExercise,
  type SessionDraft,
  type Performance,
} from "@/lib/session/model";
import {
  catalogIndex,
  type CatalogLift,
  type LiveWorkout,
} from "@/lib/workout-session";
import { type Entry } from "@/lib/tracking";
import { cardWeight, type CardUnit } from "@/lib/share-cards";
import { targetMuscles } from "@/lib/exercise-taxonomy";
import { planToLive } from "@/lib/session/live";
import { SessionDraftProvider, useSessionDraft } from "./draft-provider";
import { ExerciseMedia } from "./media";
type Props = {
  catalog: CatalogLift[];
  history: Entry[];
  unit: CardUnit;
  onStart: (live: LiveWorkout) => void;
  onClose: () => void;
};
type Lobby = {
  plan: SessionDraft;
  fresh: MuscleGroup[];
  streak: number;
  last: { split: Split; at: string } | null;
  repeat: SessionDraft | null;
  saved: {
    id: string;
    plan: SessionDraft;
    lastUsedAt: string | null;
    missing: number;
  }[];
  weekly: Partial<Record<MuscleGroup, number>>;
  performance: Record<string, Performance>;
  favorites: string[];
};
export function SessionBuilder(props: Props) {
  const { status } = useStore();
  return (
    <SessionDraftProvider userId={status.user?.id ?? "guest"}>
      <Builder {...props} />
    </SessionDraftProvider>
  );
}
function LibraryLink({ id }: { id: string }) {
  return (
    <a
      href={`/?exercise=${encodeURIComponent(id)}#exercises`}
      target="_blank"
      rel="noopener noreferrer"
      className="sb-library-link"
    >
      View exercise in library <ExternalLink size={12} />
      <span className="sr-only"> (new tab)</span>
    </a>
  );
}
function MuscleMap({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (g: string) => void;
}) {
  const zones: {
    group: MuscleGroup;
    x: number;
    y: number;
    w: number;
    h: number;
  }[] = [
    { group: "Shoulders", x: 25, y: 48, w: 28, h: 22 },
    { group: "Shoulders", x: 107, y: 48, w: 28, h: 22 },
    { group: "Chest", x: 54, y: 48, w: 25, h: 35 },
    { group: "Chest", x: 82, y: 48, w: 25, h: 35 },
    { group: "Arms", x: 24, y: 75, w: 16, h: 100 },
    { group: "Arms", x: 120, y: 75, w: 16, h: 100 },
    { group: "Back", x: 44, y: 87, w: 12, h: 47 },
    { group: "Back", x: 104, y: 87, w: 12, h: 47 },
    { group: "Core", x: 58, y: 88, w: 44, h: 52 },
    { group: "Glutes", x: 56, y: 145, w: 48, h: 25 },
    { group: "Legs", x: 56, y: 176, w: 21, h: 91 },
    { group: "Legs", x: 83, y: 176, w: 21, h: 91 },
  ];
  return (
    <svg
      className="sb-body"
      viewBox="0 0 160 290"
      aria-label="Choose a muscle group"
    >
      <circle cx="80" cy="19" r="17" fill="#292c35" />
      <rect x="72" y="35" width="16" height="10" rx="6" fill="#292c35" />
      {zones.map((z, i) => (
        <g
          key={i}
          role="button"
          tabIndex={0}
          aria-label={z.group}
          aria-pressed={selected === z.group}
          onClick={() => onSelect(z.group)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(z.group);
            }
          }}
        >
          <rect
            x={z.x}
            y={z.y}
            width={z.w}
            height={z.h}
            rx="10"
            fill={
              selected === z.group ||
              selected === "All" ||
              selected === "Full body"
                ? "var(--sb-blue)"
                : "#292c35"
            }
          />
        </g>
      ))}
    </svg>
  );
}
function LibraryCard({
  lift,
  added,
  toggle,
  suggested,
}: {
  lift: CatalogLift;
  added: boolean;
  toggle: () => void;
  suggested: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: "library:" + lift.id,
    data: { lift },
  });
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`sb-exercise ${added ? "added" : ""}`}
    >
      <div className="sb-card-image">
        <ExerciseMedia lift={lift} />
        <span className="sb-gear">{lift.equipment || "Body only"}</span>
        <button
          className="sb-drag"
          aria-label={`Drag ${lift.name} to session`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={15} />
        </button>
      </div>
      <div className="sb-card-info">
        <div>
          <strong>{lift.name}</strong>
          <small>
            {lift.primary_muscle}
            {lift.secondary_muscles?.length
              ? " · " + lift.secondary_muscles.join(", ")
              : ""}
            {suggested ? " · suggested" : ""}
          </small>
          <LibraryLink id={lift.id} />
        </div>
        <button
          className="sb-add"
          aria-label={`${added ? "Remove" : "Add"} ${lift.name}`}
          aria-pressed={added}
          onClick={toggle}
        >
          {added ? <Check /> : <Plus />}
        </button>
      </div>
    </article>
  );
}
function StackRow({
  e,
  index,
  lift,
  last,
  unit,
  selected,
  onSelect,
}: {
  e: DraftExercise;
  index: number;
  lift?: CatalogLift;
  last?: Performance;
  unit: CardUnit;
  selected: boolean;
  onSelect: () => void;
}) {
  const { draft, dispatch } = useSessionDraft();
  const [editing, setEditing] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: e.exerciseId });
  const rest = e.restOverrideSec ?? draft.defaultRestSec;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`sb-stack-row ${e.supersetGroup ? "superset" : ""}`}
    >
      <button
        className="sb-grip"
        aria-label={`Reorder ${e.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={17} />
      </button>
      <span className="sb-position">{index + 1}</span>
      <input
        type="checkbox"
        aria-label={`Select ${e.name} for superset`}
        checked={selected}
        onChange={onSelect}
      />
      <div className="sb-stack-name">
        <strong>{e.name}</strong>
        {e.supersetGroup && (
          <button
            className="sb-badge"
            onClick={() => dispatch({ type: "UNLINK", id: e.exerciseId })}
          >
            Superset {e.supersetGroup} ×
          </button>
        )}
        <small>
          {e.muscleGroup} · last time{" "}
          {last
            ? `${last.sets}×${last.commonReps} @ ${cardWeight(last.weightKg, unit)} ${unit}`
            : "new"}
        </small>
        {lift && !e.custom && <LibraryLink id={lift.id} />}
      </div>
      <div className="sb-target">
        <button
          aria-label={`Fewer sets for ${e.name}`}
          disabled={e.targetSets <= 1}
          onClick={() =>
            dispatch({
              type: "SET_TARGET",
              id: e.exerciseId,
              sets: e.targetSets - 1,
            })
          }
        >
          <Minus size={15} />
        </button>
        <button
          aria-label={`Edit reps for ${e.name}`}
          onClick={() => setEditing(!editing)}
        >
          {e.targetSets} × {e.repMin}
          {e.repMax !== e.repMin ? "–" + e.repMax : ""}
        </button>
        <button
          aria-label={`More sets for ${e.name}`}
          disabled={e.targetSets >= 10}
          onClick={() =>
            dispatch({
              type: "SET_TARGET",
              id: e.exerciseId,
              sets: e.targetSets + 1,
            })
          }
        >
          <Plus size={15} />
        </button>
      </div>
      <button
        className={`sb-rest ${e.restOverrideSec === null ? "default" : ""}`}
        aria-label={`Rest for ${e.name}: ${e.restOverrideSec === null ? "Default, " : ""}${rest} seconds`}
        onClick={() => {
          const choices = SESSION.restCycle;
          dispatch({
            type: "SET_REST",
            id: e.exerciseId,
            sec: choices[
              (choices.indexOf(e.restOverrideSec as (typeof choices)[number]) +
                1) %
                choices.length
            ],
          });
        }}
      >
        <Clock3 size={13} />
        {rest}s{e.restOverrideSec === null ? " · default" : ""}
      </button>
      <button
        className="sb-remove"
        aria-label={`Remove ${e.name} from session`}
        onClick={() => dispatch({ type: "REMOVE", id: e.exerciseId })}
      >
        <X size={16} />
      </button>
      {editing && (
        <div className="sb-rep-picker">
          <Field label="Minimum reps">
            <input
              type="number"
              min="1"
              max="50"
              value={e.repMin}
              onChange={(v) =>
                dispatch({
                  type: "SET_TARGET",
                  id: e.exerciseId,
                  repMin: Number(v.target.value),
                })
              }
            />
          </Field>
          <Field label="Maximum reps">
            <input
              type="number"
              min="1"
              max="50"
              value={e.repMax}
              onChange={(v) =>
                dispatch({
                  type: "SET_TARGET",
                  id: e.exerciseId,
                  repMax: Number(v.target.value),
                })
              }
            />
          </Field>
          <button onClick={() => setEditing(false)}>Done</button>
        </div>
      )}
    </li>
  );
}
function DropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: "stack-drop" });
  return (
    <div ref={setNodeRef} className={`sb-drop ${isOver ? "over" : ""}`}>
      <Plus size={18} /> Drop an exercise here
    </div>
  );
}
function HoldButton({
  onStart,
  disabled,
  tap,
}: {
  onStart: () => void;
  disabled: boolean;
  tap: boolean;
}) {
  const [progress, setProgress] = useState(0),
    frame = useRef(0),
    holding = useRef(false);
  function cancel() {
    holding.current = false;
    cancelAnimationFrame(frame.current);
    setProgress(0);
  }
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  function hold() {
    if (disabled || holding.current || tap) return;
    holding.current = true;
    const at = performance.now();
    const tick = (now: number) => {
      if (!holding.current) return;
      const p = Math.min(1, (now - at) / SESSION.holdMs);
      setProgress(p);
      if (p === 1) {
        holding.current = false;
        navigator.vibrate?.(15);
        onStart();
      } else frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }
  return (
    <button
      className="sb-hold"
      disabled={disabled}
      aria-label={tap ? "Tap to start workout" : "Hold to start workout"}
      onPointerDown={hold}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onClick={() => {
        if (tap) onStart();
      }}
      onKeyDown={(e) => {
        if ([" ", "Enter"].includes(e.key)) {
          e.preventDefault();
          if (!e.repeat) {
            if (tap) onStart();
            else hold();
          }
        }
      }}
      onKeyUp={cancel}
      onBlur={cancel}
    >
      <span
        className="sb-hold-ring"
        style={{ "--progress": `${progress * 360}deg` } as CSSProperties}
      >
        ▶
      </span>
      <span>
        <strong>{tap ? "Tap" : "Hold"} to start</strong>
        <small>
          {tap
            ? "Start the 3–2–1 countdown"
            : "Hold for a moment, then 3–2–1 into set one"}
        </small>
      </span>
    </button>
  );
}
function Builder({ catalog, unit, onStart, onClose }: Props) {
  const { draft, dispatch, stale, resolveStale, storageError } =
    useSessionDraft();
  const { status } = useStore();
  const [openedAt] = useState(Date.now);
  const [screen, setScreen] = useState<"lobby" | "builder" | "stack">("lobby"),
    [lobby, setLobby] = useState<Lobby | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true);
  const [group, setGroup] = useState("All"),
    [gear, setGear] = useState(""),
    [query, setQuery] = useState(""),
    [debounced, setDebounced] = useState(""),
    [view, setView] = useState<"grid" | "list">("grid"),
    [filter, setFilter] = useState("all");
  const [results, setResults] = useState<CatalogLift[]>([]),
    [total, setTotal] = useState(0),
    [cursor, setCursor] = useState<string | null>(null),
    [counts, setCounts] = useState<Record<string, number>>({}),
    [searching, setSearching] = useState(false),
    [selected, setSelected] = useState<string[]>([]);
  const [customName, setCustomName] = useState(""),
    [customMuscle, setCustomMuscle] = useState(""),
    [showCustom, setShowCustom] = useState(false),
    [showSaved, setShowSaved] = useState(false),
    [replace, setReplace] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null),
    [starting, setStarting] = useState(false),
    [tap, setTap] = useState(false);
  const attempt = useRef<{
      canceled: boolean;
      activating?: boolean;
      id?: string;
      key: string;
    } | null>(null),
    countDone = useRef<(() => void) | null>(null),
    countTimer = useRef<ReturnType<typeof setInterval> | null>(null),
    grid = useRef<HTMLDivElement>(null),
    dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.scrollTo({ top: 0 });
  }, [screen]);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const summary = stats(draft),
    planned = coverage(draft.exercises),
    warnings = flags(draft, lobby?.weekly),
    index = useMemo(() => catalogIndex(catalog), [catalog]);
  const equipment = [
    ...new Set(catalog.map((e) => e.equipment).filter((e): e is string => !!e)),
  ].sort();
  useEffect(() => {
    const abort = new AbortController();
    Promise.all([
      fetch("/api/lobby", { signal: abort.signal }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not load your lobby.");
        return d as Lobby;
      }),
      fetch("/api/exercises/counts", { signal: abort.signal }).then((r) =>
        r.json(),
      ),
    ])
      .then(([l, c]) => {
        setLobby(l);
        setCounts(c);
        setLoading(false);
      })
      .catch((e) => {
        if (!abort.signal.aborted) {
          setError(errorText(e));
          setLoading(false);
        }
      });
    setTap(
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
        localStorage.getItem("session-tap-start") === "1",
    );
    return () => abort.abort();
  }, []);
  useEffect(() => {
    const t = setTimeout(
      () => setDebounced(query.trim().length >= 2 ? query.trim() : ""),
      SESSION.searchMs,
    );
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    if (screen === "lobby") return;
    const abort = new AbortController();
    setSearching(true);
    setCursor(null);
    grid.current?.scrollTo(0, 0);
    const params = new URLSearchParams({
      group,
      collection: filter,
      equipment: gear,
      q: debounced,
      repBasedOnly: "true",
      limit: String(SESSION.pageSize),
    });
    fetch("/api/exercises?" + params, { signal: abort.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        return d;
      })
      .then((d) => {
        setResults(d.exercises);
        setTotal(d.total);
        setCursor(d.nextCursor);
        setSearching(false);
      })
      .catch((e) => {
        if (!abort.signal.aborted) {
          setError(errorText(e));
          setSearching(false);
        }
      });
    return () => abort.abort();
  }, [group, gear, debounced, screen, filter]);
  async function more() {
    if (!cursor || searching) return;
    setSearching(true);
    try {
      const p = new URLSearchParams({
        group,
        collection: filter,
        equipment: gear,
        q: debounced,
        repBasedOnly: "true",
        limit: String(SESSION.pageSize),
        cursor,
      });
      const d = await api<{
        exercises: CatalogLift[];
        nextCursor: string | null;
      }>("exercises?" + p);
      setResults((old) => [...old, ...d.exercises]);
      setCursor(d.nextCursor);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSearching(false);
    }
  }
  function load(plan: SessionDraft, next: "builder" | "stack" = "builder") {
    const exercises = plan.exercises.filter(
      (e) => e.custom || !catalog.length || index.has(e.exerciseId),
    );
    const missing = plan.exercises.length - exercises.length;
    if (missing)
      setNotice(
        `${missing} exercise${missing === 1 ? " is" : "s are"} no longer available.`,
      );
    dispatch({
      type: "LOAD_PLAN",
      plan: { ...plan, exercises, updatedAt: Date.now() },
    });
    setScreen(next);
  }
  function focus(split: Split) {
    dispatch({
      type: "LOAD_PLAN",
      plan: {
        ...emptyDraft(),
        split,
        name: split === "custom" ? "My workout" : `${SPLIT_NAMES[split]} Day`,
      },
    });
    setGroup(
      split === "push"
        ? "Chest"
        : split === "pull"
          ? "Back"
          : split === "legs"
            ? "Legs"
            : split === "core"
              ? "Core"
              : "All",
    );
    setScreen("builder");
  }
  function toggle(lift: CatalogLift) {
    if (
      draft.exercises.length >= SESSION.maxLifts &&
      !draft.exercises.some((e) => e.exerciseId === lift.id)
    ) {
      setError("A session can contain up to 30 lifts.");
      return;
    }
    dispatch({
      type: "TOGGLE",
      exercise: makeExercise(lift, lobby?.performance[lift.id]),
    });
  }
  function dragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const lift = active.data.current?.lift as CatalogLift | undefined;
    if (lift) {
      dispatch({
        type: "ADD",
        exercise: makeExercise(lift, lobby?.performance[lift.id]),
        at:
          over.id === "stack-drop"
            ? undefined
            : draft.exercises.findIndex((e) => e.exerciseId === over.id),
      });
    } else
      dispatch({
        type: "MOVE",
        from: draft.exercises.findIndex((e) => e.exerciseId === active.id),
        to:
          over.id === "stack-drop"
            ? draft.exercises.length - 1
            : draft.exercises.findIndex((e) => e.exerciseId === over.id),
      });
  }
  async function saveTemplate(replaceId?: string) {
    try {
      const result = await api<{
        replaceId?: string;
        name?: string;
        saved?: boolean;
      }>("saved-workouts", { plan: draft, replaceId });
      if (result.replaceId) {
        setReplace(result.replaceId);
        return;
      }
      setReplace(null);
      setNotice("Workout saved as a template.");
      const refreshed = await api<Lobby>("lobby");
      setLobby(refreshed);
    } catch (e) {
      setError(errorText(e));
    }
  }
  useEffect(
    () => () => {
      if (countTimer.current) clearInterval(countTimer.current);
      countDone.current?.();
      const run = attempt.current;
      if (run && !run.activating) {
        run.canceled = true;
        if (run.id)
          void fetch("/api/sessions/" + run.id, {
            method: "DELETE",
            keepalive: true,
          }).catch(() => {});
      }
    },
    [],
  );
  async function cancelStart() {
    const current = attempt.current;
    if (!current || current.activating) return;
    current.canceled = true;
    if (countTimer.current) clearInterval(countTimer.current);
    countDone.current?.();
    setCountdown(null);
    if (current.id) {
      try {
        await api("sessions/" + current.id, {}, "DELETE");
      } catch {
        setError(
          "Cancellation could not reach the server. Your plan is kept; the pending session has not started.",
        );
      } finally {
        if (attempt.current === current) {
          attempt.current = null;
          setStarting(false);
        }
      }
    }
  }
  async function start(plan: SessionDraft) {
    if (attempt.current || !plan.exercises.length) return;
    if (!navigator.onLine) {
      setError(
        "Couldn't start — check your connection and try again. Your draft is kept.",
      );
      return;
    }
    setError("");
    dispatch({ type: "LOAD_PLAN", plan });
    const run = {
      canceled: false,
      activating: false,
      key: `${status.user?.id}:${plan.updatedAt}`,
      id: undefined as string | undefined,
    };
    attempt.current = run;
    setStarting(true);
    setCountdown(3);
    let tick = 3;
    const counted = new Promise<void>((resolve) => {
      countDone.current = resolve;
      countTimer.current = setInterval(() => {
        tick--;
        if (tick > 0) {
          setCountdown(tick);
          navigator.vibrate?.(10);
        } else {
          if (countTimer.current) clearInterval(countTimer.current);
          resolve();
        }
      }, 1000);
    });
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": run.key,
        },
        body: JSON.stringify(plan),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Couldn't start — try again");
      run.id = data.sessionId;
      if (run.canceled) {
        await api("sessions/" + run.id, {}, "DELETE");
        if (attempt.current === run) {
          attempt.current = null;
          setStarting(false);
        }
        return;
      }
      await counted;
      if (run.canceled) return;
      run.activating = true;
      setCountdown(0);
      const activated = await api<{ startedAt: string }>(
        "sessions/" + run.id,
        { action: "start" },
        "PATCH",
      );
      if (run.canceled) return;
      const live = planToLive(
        plan,
        run.id!,
        unit,
        catalog,
        activated.startedAt,
      );
      try {
        sessionStorage.setItem(
          "firstrep.live-workout.v1." + status.user?.id,
          JSON.stringify(live),
        );
      } catch {}
      window.history.pushState(null, "", "/session/" + live.id + "#workout");
      dispatch({ type: "RESET" });
      onStart(live);
    } catch (e) {
      if (countTimer.current) clearInterval(countTimer.current);
      setCountdown(null);
      setError(errorText(e));
      run.canceled = true;
      if (attempt.current === run) attempt.current = null;
      setStarting(false);
    }
  }
  const displayed = results;
  const flagged = warnings[0]?.group;
  const suggested = catalog
    .filter(
      (e) =>
        repBased(e) &&
        matchesGroup(e, group) &&
        (!gear || e.equipment === gear) &&
        (!debounced ||
          [e.name, e.primary_muscle, e.equipment].some((s) =>
            s?.toLowerCase().includes(debounced.toLowerCase()),
          )) &&
        !draft.exercises.some((d) => d.exerciseId === e.id) &&
        (flagged ? matchesGroup(e, flagged) : false),
    )
    .sort(
      (a, b) =>
        Number(!lobby?.favorites.includes(a.id)) -
          Number(!lobby?.favorites.includes(b.id)) ||
        Number(
          !(
            lobby?.performance[a.id] &&
            openedAt - Date.parse(lobby.performance[a.id].at) <
              SESSION.recentDays * 86400000
          ),
        ) -
          Number(
            !(
              lobby?.performance[b.id] &&
              openedAt - Date.parse(lobby.performance[b.id].at) <
                SESSION.recentDays * 86400000
            ),
          ) ||
        Number(!draft.exercises.some((e) => e.equipment === a.equipment)) -
          Number(!draft.exercises.some((e) => e.equipment === b.equipment)) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 3);
  const cards = filter === "suggested" ? suggested : displayed;
  const library = (
    <section className="sb-library">
      <div className="sb-library-heading">
        <h2>Library</h2>
        <span>{counts.All ?? catalog.filter(repBased).length} exercises</span>
      </div>
      {screen === "builder" && (
        <div className="sb-muscle-map">
          <MuscleMap selected={group} onSelect={setGroup} />
          <div>
            <div className="sb-section-label">
              Tap a muscle <span>Primary + secondary</span>
            </div>
            <div className="sb-muscle-chips">
              {[...GROUPS, "All"].map((g) => (
                <button
                  key={g}
                  aria-label={g}
                  aria-pressed={group === g}
                  onClick={() => setGroup(g)}
                >
                  {g}
                  <span>{counts[g] ?? "–"}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="sb-search-row">
        <label className="sb-search">
          <Search size={19} />
          <input
            type="search"
            aria-label="Find a session exercise"
            placeholder="Search lifts, muscles, gear…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Equipment"
          value={gear}
          onChange={(e) => setGear(e.target.value)}
        >
          <option value="">All gear</option>
          {equipment.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
      </div>
      <div className="sb-filter-row">
        {["all", "suggested", "favorites", "recent"].map((f) => (
          <button
            key={f}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
        {screen === "stack" && (
          <select
            aria-label="Muscle group"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            {["All", ...GROUPS].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        )}
      </div>
      {warnings.length > 0 && (
        <button
          className="sb-callout"
          onClick={() => {
            setFilter("suggested");
            setGroup("All");
            setGear("");
            setQuery("");
          }}
        >
          {warnings[0].message} Explore suggested lifts.
        </button>
      )}
      <div className="sb-result-heading">
        <h3>
          {total} {group === "All" ? "" : group} exercises
        </h3>
        <div role="group" aria-label="Exercise view">
          <button
            aria-label="List view"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List size={18} />
          </button>
          <button
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
            <LayoutGrid size={18} />
          </button>
        </div>
      </div>
      <div ref={grid} className={`sb-results ${view}`} aria-busy={searching}>
        {cards.map((lift) => (
          <LibraryCard
            key={lift.id}
            lift={lift}
            added={draft.exercises.some((e) => e.exerciseId === lift.id)}
            toggle={() => toggle(lift)}
            suggested={filter === "suggested"}
          />
        ))}
      </div>
      {!searching && !cards.length && (
        <div className="sb-empty">
          No matches{query ? ` for “${query}”` : ""}.{" "}
          <button
            onClick={() => {
              setQuery("");
              setGroup("All");
              setGear("");
              setFilter("all");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      {cursor && filter !== "suggested" && (
        <button
          className="sb-secondary full"
          disabled={searching}
          onClick={more}
        >
          {searching ? "Loading…" : "Show more"}
        </button>
      )}
      <button
        className="sb-custom-link"
        onClick={() => {
          setShowCustom(!showCustom);
          setCustomName(query);
        }}
      >
        <Plus size={16} /> Add your own exercise
      </button>
      {showCustom && (
        <div className="sb-custom">
          <Field label="Custom exercise name">
            <input
              maxLength={300}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
          </Field>
          <Field label="Custom exercise target muscle">
            <select
              value={customMuscle}
              onChange={(e) => setCustomMuscle(e.target.value)}
            >
              <option value="">Choose a muscle</option>
              {targetMuscles.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
          <button
            className="sb-secondary"
            disabled={
              !customName.trim() ||
              !customMuscle ||
              draft.exercises.length >= 30
            }
            onClick={() => {
              dispatch({
                type: "ADD",
                exercise: {
                  ...makeExercise({
                    id: "custom:" + crypto.randomUUID(),
                    name: customName.trim(),
                    primary_muscle: customMuscle,
                  }),
                  custom: true,
                  targetMuscle: customMuscle,
                },
              });
              setShowCustom(false);
              setCustomName("");
            }}
          >
            Add custom exercise
          </button>
        </div>
      )}
    </section>
  );
  const stack = (
    <section className="sb-stack">
      <div className="sb-stat-grid">
        {[
          ["Lifts", summary.lifts],
          ["Working sets", summary.sets],
          ["Est. time", `~${summary.minutes}`],
          ["Default rest", `${draft.defaultRestSec}s`],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>
              {value}
              {label === "Est. time" && <small> min</small>}
            </strong>
          </div>
        ))}
      </div>
      <div className="sb-stack-toolbar">
        <span>Order · drag to rearrange</span>
        <button
          className="sb-secondary"
          disabled={
            selected.length < 2 ||
            selected.length > 3 ||
            selected
              .map((id) =>
                draft.exercises.findIndex((e) => e.exerciseId === id),
              )
              .sort((a, b) => a - b)
              .some((v, i, arr) => i > 0 && v !== arr[i - 1] + 1)
          }
          onClick={() => {
            dispatch({ type: "LINK_SUPERSET", ids: selected });
            setSelected([]);
          }}
        >
          Link as superset
        </button>
      </div>
      <SortableContext
        items={draft.exercises.map((e) => e.exerciseId)}
        strategy={verticalListSortingStrategy}
      >
        <ol className="sb-stack-list">
          {draft.exercises.map((e, i) => (
            <StackRow
              key={e.exerciseId}
              e={e}
              index={i}
              lift={index.get(e.exerciseId)}
              last={lobby?.performance[e.exerciseId]}
              unit={unit}
              selected={selected.includes(e.exerciseId)}
              onSelect={() =>
                setSelected((old) =>
                  old.includes(e.exerciseId)
                    ? old.filter((id) => id !== e.exerciseId)
                    : [...old, e.exerciseId],
                )
              }
            />
          ))}
        </ol>
      </SortableContext>
      <DropZone />
      <div className="sb-coverage">
        <div className="sb-section-label">
          Muscle coverage · sets{" "}
          <span>
            Weekly target {SESSION.weeklyMin}–{SESSION.weeklyMax}
          </span>
        </div>
        {GROUPS.filter((g) => g !== "Full body").map((g) => (
          <div
            className={`sb-coverage-row ${warnings.some((w) => w.group === g) ? "flagged" : ""}`}
            key={g}
          >
            <span>
              {g}
              <small>{(lobby?.weekly[g] ?? 0) + planned[g]} this week</small>
            </span>
            <div className="sb-bar">
              <i
                style={{
                  width: `${Math.min(100, (planned[g] / SESSION.weeklyMax) * 100)}%`,
                }}
              />
            </div>
            <b>{planned[g]}</b>
          </div>
        ))}
        {warnings.map((w, i) => (
          <p key={i} className="sb-warning">
            {w.message}
          </p>
        ))}
      </div>
    </section>
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          if (starting) void cancelStart();
          else onClose();
        }
      }}
    >
      <DialogContent
        ref={dialog}
        className={`sb-dialog sb-${screen}`}
        overlayClassName="ws-overlay"
      >
        <DndContext sensors={sensors} onDragEnd={dragEnd}>
          <header className="sb-header">
            <div>
              <p className="sb-eyebrow">
                {screen === "lobby"
                  ? new Intl.DateTimeFormat("en-US", {
                      weekday: "long",
                      timeZone: status.user?.timezone,
                    }).format(new Date()) + " · Live session"
                  : screen === "stack"
                    ? "Your session"
                    : "Live session"}
              </p>
              <DialogTitle>
                {screen === "lobby"
                  ? "Ready to train?"
                  : screen === "stack"
                    ? draft.name
                    : "Build your session"}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Build your live session. Choose exercises and plan targets. Only
                completed sets are saved to your workout log.
              </DialogDescription>
            </div>
            <button
              className="sb-close"
              aria-label="Close session setup"
              onClick={() => {
                if (starting) void cancelStart();
                else onClose();
              }}
            >
              <X />
            </button>
          </header>
          {(error || storageError) && (
            <p role="alert" className="sb-error">
              {error || storageError}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </p>
          )}
          {notice && (
            <p role="status" className="sb-notice">
              {notice}
            </p>
          )}
          {stale && (
            <div className="sb-notice">
              Resume your draft? It is more than 24 hours old.
              <button
                onClick={() => {
                  resolveStale(true);
                  setScreen("builder");
                }}
              >
                Resume draft
              </button>
              <button onClick={() => resolveStale(false)}>Discard</button>
            </div>
          )}
          {screen === "lobby" ? (
            <div className="sb-lobby-content">
              {draft.exercises.length > 0 && !stale && (
                <button
                  className="sb-resume"
                  onClick={() => setScreen("builder")}
                >
                  Continue your draft · {draft.name} · {summary.lifts} lifts{" "}
                  <ArrowRight size={18} />
                </button>
              )}
              <div className="sb-status-strip">
                <div>
                  <span>Week streak</span>
                  <strong>
                    {lobby?.streak ?? 0} <small>weeks</small>
                  </strong>
                </div>
                <div>
                  <span>Last session</span>
                  <strong>
                    {lobby?.last ? SPLIT_NAMES[lobby.last.split] : "Your first"}
                    <small>
                      {lobby?.last
                        ? " · " + relative(lobby.last.at)
                        : " session awaits"}
                    </small>
                  </strong>
                </div>
                <div>
                  <span>Fresh today</span>
                  <div className="sb-fresh">
                    {lobby?.fresh.slice(0, 4).map((g) => (
                      <span key={g}>{g}</span>
                    ))}
                  </div>
                </div>
              </div>
              {loading ? (
                <p role="status">Finding your next session…</p>
              ) : (
                lobby && (
                  <article className="sb-hero">
                    <div className="sb-hero-media">
                      <ExerciseMedia
                        lift={index.get(lobby.plan.exercises[0]?.exerciseId)}
                      />
                      <span className="sb-up-next">Up next</span>
                    </div>
                    <div className="sb-hero-info">
                      <h2>{lobby.plan.name}</h2>
                      <p>
                        Built from your rotation · {stats(lobby.plan).lifts}{" "}
                        lifts · {stats(lobby.plan).sets} sets · ~
                        {stats(lobby.plan).minutes} min
                      </p>
                      <div className="sb-hero-actions">
                        <button
                          className="sb-primary"
                          disabled={starting || !lobby.plan.exercises.length}
                          onClick={() => {
                            dispatch({ type: "LOAD_PLAN", plan: lobby.plan });
                            document
                              .getElementById("session-hold")
                              ?.scrollIntoView({
                                behavior: "smooth",
                                block: "center",
                              });
                          }}
                        >
                          Start this <ArrowRight size={20} />
                        </button>
                        <button
                          className="sb-secondary"
                          onClick={() => load(lobby.plan)}
                        >
                          Customize
                        </button>
                      </div>
                    </div>
                  </article>
                )
              )}
              <h3 className="sb-section-label">Or pick a focus</h3>
              <div className="sb-focus-grid">
                {(
                  ["push", "pull", "legs", "core", "full", "custom"] as Split[]
                ).map((s) => (
                  <button
                    className={
                      lobby &&
                      SPLIT_GROUPS[s].length > 0 &&
                      SPLIT_GROUPS[s].every((g) => lobby.fresh.includes(g))
                        ? "fresh"
                        : ""
                    }
                    key={s}
                    onClick={() => focus(s)}
                  >
                    <strong>
                      {s === "custom" ? "From scratch" : SPLIT_NAMES[s]}
                    </strong>
                    <span>
                      {s === "custom"
                        ? `Browse all ${counts.All ?? catalog.filter(repBased).length}`
                        : SPLIT_GROUPS[s].join(" · ")}
                    </span>
                  </button>
                ))}
              </div>
              <div className="sb-section-label">
                Jump back in{" "}
                <button onClick={() => setShowSaved(!showSaved)}>
                  All saved
                </button>
              </div>
              <div className="sb-saved-grid">
                {(showSaved ? lobby?.saved : lobby?.saved.slice(0, 3))?.map(
                  (w) => (
                    <button
                      key={w.id}
                      onClick={() => {
                        load(w.plan);
                        if (w.missing)
                          setNotice(
                            `${w.missing} exercise is no longer available.`,
                          );
                      }}
                    >
                      <strong>{w.plan.name}</strong>
                      <span>
                        {stats(w.plan).lifts} lifts · ~{stats(w.plan).minutes}{" "}
                        min
                      </span>
                      <small>
                        {w.lastUsedAt
                          ? "Last: " + relative(w.lastUsedAt)
                          : "Ready when you are"}
                      </small>
                    </button>
                  ),
                )}
              </div>
              <div id="session-hold">
                <HoldButton
                  disabled={
                    starting ||
                    !(draft.exercises.length || lobby?.plan.exercises.length)
                  }
                  tap={tap}
                  onStart={() =>
                    void start(draft.exercises.length ? draft : lobby!.plan)
                  }
                />
                <label className="sb-tap-setting">
                  <input
                    type="checkbox"
                    checked={tap}
                    onChange={(e) => {
                      setTap(e.target.checked);
                      localStorage.setItem(
                        "session-tap-start",
                        e.target.checked ? "1" : "0",
                      );
                    }}
                  />{" "}
                  Tap to start instead of holding
                </label>
              </div>
            </div>
          ) : (
            <>
              <div className="sb-meta">
                <label className="sb-name">
                  <input
                    aria-label="Session name"
                    maxLength={120}
                    value={draft.name}
                    onChange={(e) =>
                      dispatch({ type: "SET_META", name: e.target.value })
                    }
                  />
                </label>
                <div
                  className="sb-rest-options"
                  role="group"
                  aria-label="Default rest"
                >
                  <Clock3 size={18} />
                  {SESSION.restOptions.map((n) => (
                    <button
                      key={n}
                      aria-pressed={draft.defaultRestSec === n}
                      onClick={() =>
                        dispatch({ type: "SET_META", defaultRestSec: n })
                      }
                    >
                      {n < 120 ? n + "s" : n / 60 + "m"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sb-shortcuts">
                <button
                  disabled={!lobby?.repeat}
                  onClick={() =>
                    lobby?.repeat && load({ ...lobby.repeat, source: "repeat" })
                  }
                >
                  <RotateCcw />
                  <span>
                    <b>Repeat last workout</b>
                    <small>
                      {lobby?.repeat?.name ?? "Your first session starts here"}
                    </small>
                  </span>
                </button>
                <button onClick={() => setShowSaved(!showSaved)}>
                  <Bookmark />
                  <span>
                    <b>Saved workouts</b>
                    <small>{lobby?.saved.length ?? 0} saved</small>
                  </span>
                  <ChevronDown size={18} />
                </button>
              </div>
              {showSaved && (
                <div className="sb-saved-grid">
                  {lobby?.saved.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => {
                        load(w.plan);
                        setShowSaved(false);
                      }}
                    >
                      {w.plan.name}
                    </button>
                  ))}
                </div>
              )}
              <nav className="sb-screen-tabs">
                <button onClick={() => setScreen("lobby")}>
                  <ArrowLeft size={15} /> Lobby
                </button>
                <button
                  aria-current={screen === "builder" ? "step" : undefined}
                  onClick={() => setScreen("builder")}
                >
                  1 · Pick lifts
                </button>
                <button
                  aria-current={screen === "stack" ? "step" : undefined}
                  onClick={() => {
                    setScreen("stack");
                    setView("list");
                  }}
                >
                  2 · Order & targets
                </button>
              </nav>
              <div className="sb-workspace">
                {library}
                {stack}
              </div>
              <footer className="sb-tray">
                <div className="sb-tray-summary">
                  <span>
                    <b>{summary.lifts}</b> lifts
                  </span>
                  <span>
                    <b>{summary.sets}</b> sets
                  </span>
                  <span>
                    <b>~{summary.minutes}</b> min
                  </span>
                  <div className="sb-tray-chips">
                    {draft.exercises.map((e) => (
                      <button
                        key={e.exerciseId}
                        aria-label={`Remove ${e.name} from tray`}
                        onClick={() =>
                          dispatch({ type: "REMOVE", id: e.exerciseId })
                        }
                      >
                        {e.name} ×
                      </button>
                    ))}
                  </div>
                </div>
                <div className="sb-tray-actions">
                  {screen === "stack" ? (
                    <button
                      className="sb-secondary"
                      disabled={!summary.lifts || !draft.name.trim()}
                      onClick={() => void saveTemplate()}
                    >
                      Save as template
                    </button>
                  ) : (
                    <button
                      className="sb-secondary"
                      onClick={() => {
                        setScreen("stack");
                        setView("list");
                      }}
                    >
                      Next: order lifts <ArrowRight size={17} />
                    </button>
                  )}
                  <button
                    className="sb-primary"
                    disabled={!summary.lifts || !draft.name.trim() || starting}
                    onClick={() => void start(draft)}
                  >
                    {summary.lifts ? "Start workout" : "Add a lift to start"}{" "}
                    <ArrowRight size={20} />
                  </button>
                </div>
              </footer>
            </>
          )}
          {replace && (
            <div
              className="sb-replace"
              role="alertdialog"
              aria-label="Replace saved workout"
            >
              <p>Replace {draft.name}?</p>
              <button className="sb-secondary" onClick={() => setReplace(null)}>
                Cancel
              </button>
              <button
                className="sb-primary"
                onClick={() => void saveTemplate(replace)}
              >
                Replace template
              </button>
            </div>
          )}
          {countdown !== null && (
            <div className="sb-countdown">
              <div role="status" aria-live="assertive" aria-atomic="true">
                <span className="sr-only">Starting in </span>
                <strong>{countdown || "Go"}</strong>
              </div>
              <p>{draft.name}</p>
              <button
                className="sb-secondary"
                disabled={countdown === 0}
                onClick={() => void cancelStart()}
              >
                Cancel
              </button>
            </div>
          )}
        </DndContext>
      </DialogContent>
    </Dialog>
  );
}
function relative(at: string) {
  const days = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(at)) / 86400000),
  );
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
}
