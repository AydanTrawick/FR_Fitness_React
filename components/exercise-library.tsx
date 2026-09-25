"use client";
import {
  useCallback,
  useId,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  Copy,
  Dumbbell,
  Heart,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import catalog from "@/lib/exercises.json";
import { toLibraryExercise, type ExerciseRow } from "@/lib/exercise-catalog";
import { movementPattern } from "@/lib/analysis/catalog";
import {
  filterExercises,
  workoutSchema,
  workoutDraftSchema,
  type Exercise,
  type Workout,
  type WorkoutInput,
  type WorkoutItem,
} from "@/lib/workouts";
import { api, errorText } from "@/lib/client";
import { useStore } from "./store";
import { Field } from "./ui";
const fallbackExercises = catalog as Exercise[];
const tabs = [
  ["exercises", "Exercise Library"],
  ["favorites", "Favorite Exercises"],
  ["builder", "Build Workout"],
  ["saved", "Saved Workouts"],
];
const blank = (): WorkoutInput => ({
  name: "",
  description: "",
  exercises: [],
});
function Modal({
  title,
  close,
  children,
  error,
}: {
  error?: string;
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const headingId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      className="exercise-dialog"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="row between">
        <h2 id={headingId}>{title}</h2>
        <button className="btn icon" aria-label="Close dialog" onClick={close}>
          <X size={20} />
        </button>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {children}
    </dialog>
  );
}
function FavoriteButton({
  active,
  click,
  busy,
  label,
}: {
  active: boolean;
  click: () => void;
  busy: boolean;
  label: string;
}) {
  return (
    <button
      className={`exercise-heart ${active ? "is-favorite" : ""}`}
      aria-label={`${active ? "Unfavorite" : "Favorite"} ${label}`}
      aria-pressed={active}
      disabled={busy}
      onClick={click}
    >
      <Heart size={19} fill={active ? "currentColor" : "none"} />
    </button>
  );
}
function ExerciseCard({
  exercise: e,
  favorite,
  busy,
  toggle,
  add,
  open,
}: {
  exercise: Exercise;
  favorite: boolean;
  busy: boolean;
  toggle: () => void;
  add: () => void;
  open: () => void;
}) {
  return (
    <article className="exercise-card">
      <div className="exercise-visual">
        <button
          className="exercise-image-button"
          onClick={open}
          aria-label={`View ${e.name}`}
        >
          <Image
            src={e.images[0]}
            alt={`${e.name} demonstration showing movement and involved muscles`}
            fill
            sizes="(max-width:600px) 90vw, (max-width:1200px) 45vw, 28vw"
          />
        </button>
        <span className="exercise-level">{e.difficulty}</span>
        <FavoriteButton
          active={favorite}
          busy={busy}
          click={toggle}
          label={e.name}
        />
      </div>
      <div className="exercise-card-body">
        <p className="eyebrow">{e.primary}</p>
        <button className="exercise-title" onClick={open}>
          <h3>{e.name}</h3>
          <ArrowUpRight size={18} />
        </button>
        <div className="row between">
          <span className="muted">{e.equipment}</span>
          <button
            disabled={busy}
            className="exercise-add"
            onClick={add}
            aria-label={`Add ${e.name} to workout`}
          >
            <Plus size={16} /> Add to Workout
          </button>
        </div>
      </div>
    </article>
  );
}
function Summary({
  items,
  byId,
}: {
  items: WorkoutItem[];
  byId: Map<string, Exercise>;
}) {
  return (
    <div className="workout-summary">
      <span>
        <strong>{items.length}</strong> exercises
      </span>
      <span>
        <strong>{items.reduce((n, e) => n + e.sets, 0)}</strong> total sets
      </span>
      <p>
        {[...new Set(items.map((e) => byId.get(e.exerciseId)?.primary))].join(
          " · ",
        ) || "Choose your first exercise"}
      </p>
    </div>
  );
}
function WorkoutExerciseItem({
  item,
  index,
  total,
  change,
  move,
  remove,
  byId,
}: {
  item: WorkoutItem;
  index: number;
  total: number;
  change: (value: WorkoutItem) => void;
  move: (offset: number) => void;
  remove: () => void;
  byId: Map<string, Exercise>;
}) {
  const e = byId.get(item.exerciseId)!;
  return (
    <section className="workout-item">
      <div className="row">
        <Image src={e.images[0]} alt={e.name} width={64} height={64} />
        <div className="grow">
          <small className="eyebrow">
            EXERCISE {String(index + 1).padStart(2, "0")}
          </small>
          <h3>{e.name}</h3>
        </div>
        <button
          className="btn icon"
          aria-label={`Remove ${e.name}`}
          onClick={remove}
        >
          <X size={18} />
        </button>
      </div>
      <div className="prescription-grid">
        <Field label="Sets">
          <input
            type="number"
            min="1"
            max="100"
            value={item.sets}
            onChange={(v) => change({ ...item, sets: Number(v.target.value) })}
          />
        </Field>
        <Field label="Measure">
          <select
            value={item.mode}
            onChange={(v) =>
              change({ ...item, mode: v.target.value as "reps" | "duration" })
            }
          >
            <option value="reps">Reps</option>
            <option value="duration">Seconds</option>
          </select>
        </Field>
        {item.mode === "reps" ? (
          <Field label="Reps / range">
            <input
              value={item.reps}
              placeholder="8-12"
              onChange={(v) => change({ ...item, reps: v.target.value })}
            />
          </Field>
        ) : (
          <Field label="Duration (sec)">
            <input
              type="number"
              min="1"
              value={item.duration}
              onChange={(v) =>
                change({ ...item, duration: Number(v.target.value) })
              }
            />
          </Field>
        )}
        <Field label="Weight (kg)">
          <input
            type="number"
            min="0"
            max="1000"
            step="0.5"
            placeholder="Optional"
            value={item.weight ?? ""}
            onChange={(v) =>
              change({
                ...item,
                weight: v.target.value === "" ? null : Number(v.target.value),
              })
            }
          />
        </Field>
        <Field label="Rest (sec)">
          <input
            type="number"
            min="0"
            max="3600"
            value={item.rest}
            onChange={(v) => change({ ...item, rest: Number(v.target.value) })}
          />
        </Field>
      </div>
      <Field label="Notes">
        <input
          maxLength={2000}
          placeholder="Optional cues or adjustments"
          value={item.notes}
          onChange={(v) => change({ ...item, notes: v.target.value })}
        />
      </Field>
      <div className="row">
        <button
          className="btn secondary"
          disabled={index === 0}
          onClick={() => move(-1)}
          aria-label={`Move ${e.name} up`}
        >
          <ArrowUp size={14} /> Up
        </button>
        <button
          className="btn secondary"
          disabled={index === total - 1}
          onClick={() => move(1)}
          aria-label={`Move ${e.name} down`}
        >
          <ArrowDown size={14} /> Down
        </button>
      </div>
    </section>
  );
}
export function ExerciseLibrary({
  page,
  go,
  onSignIn,
}: {
  page: string;
  go: (page: string) => void;
  onSignIn: () => void;
}) {
  const { status } = useStore();
  const userId = status.user?.id;
  const [exercises, setExercises] = useState<Exercise[]>(fallbackExercises);
  const [catalogReady, setCatalogReady] = useState(false);
  const [notice, setNotice] = useState("");
  const byId = useMemo(
    () => new Map(exercises.map((e) => [e.id, e])),
    [exercises],
  );
  useEffect(() => {
    const controller = new AbortController();
    async function loadCatalog() {
      try {
        const response = await fetch("/api/exercises?limit=1000", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Exercise catalog is unavailable.");
        const data = (await response.json()) as { exercises: ExerciseRow[] };
        if (!Array.isArray(data.exercises))
          throw new Error("Invalid exercise catalog.");
        setExercises(data.exercises.map(toLibraryExercise));
      } catch {
        if (!controller.signal.aborted)
          setNotice(
            "Showing the built-in exercise list while the catalog is unavailable.",
          );
      } finally {
        if (!controller.signal.aborted) setCatalogReady(true);
      }
    }
    void loadCatalog();
    return () => controller.abort();
  }, []);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(!!userId);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [query, setQuery] = useState("");
  const [pattern, setPattern] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [sort, setSort] = useState("name");
  const [filters, setFilters] = useState(false);
  const [limit, setLimit] = useState(24);
  const [detail, setDetail] = useState<Exercise | null>(null);
  const [gallery, setGallery] = useState(0);
  const [view, setView] = useState<Workout | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const exercise = byId.get(params.get("exercise") ?? "");
    // Synchronize navigation deep links with the existing library state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (exercise) setDetail(exercise);
    setPattern(params.get("pattern") ?? "");
  }, [byId]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("workout");
    const saved = workouts.find((w) => w.id === id);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setView(saved);
  }, [workouts]);
  const [deleting, setDeleting] = useState<Workout | null>(null);
  const [draft, setDraft] = useState<WorkoutInput>(blank);
  const [editId, setEditId] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [workoutQuery, setWorkoutQuery] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [workoutSort, setWorkoutSort] = useState("recent");
  const key = `firstrep.workout-draft.v1.${userId ?? "guest"}`;
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (userId) {
        const [f, w] = await Promise.all([
          api<{ favorites: string[] }>("library/favorites"),
          api<{ workouts: Workout[] }>("library/workouts"),
        ]);
        setFavorites(f.favorites);
        setWorkouts(w.workouts);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    // Hydrate the authenticated collection from the existing server session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);
  useEffect(() => {
    if (!catalogReady) return;
    try {
      const guestKey = "firstrep.workout-draft.v1.guest";
      const ownDraft = sessionStorage.getItem(key);
      const fromGuest = !ownDraft && !!userId;
      const raw =
        ownDraft ?? (fromGuest ? sessionStorage.getItem(guestKey) : null);
      if (raw) {
        const data = JSON.parse(raw);
        const parsed = workoutDraftSchema.parse(data.draft);
        if (parsed.exercises.every((e) => byId.has(e.exerciseId))) {
          // Restore an external browser draft after hydration.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setDraft(parsed);
          setEditId(data.editId);
          setDirty(true);
          if (fromGuest) sessionStorage.removeItem(guestKey);
        }
      }
    } catch {
      setError(
        "The previous draft could not be restored. Your saved workouts are unaffected.",
      );
    }
    setHydrated(true);
  }, [key, userId, catalogReady, byId]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (dirty) sessionStorage.setItem(key, JSON.stringify({ draft, editId }));
      else sessionStorage.removeItem(key);
    } catch {
      // Report a failed write to external session storage.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(
        "Draft backup is unavailable in this browser. Save your workout before leaving.",
      );
    }
  }, [draft, editId, dirty, hydrated, key]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const change = (value: WorkoutInput) => {
    setDraft(value);
    setDirty(true);
  };
  const add = (e: Exercise) => {
    if (draft.exercises.length >= 100) {
      setError("A workout can contain up to 100 exercises.");
      return;
    }
    change({
      ...draft,
      exercises: [
        ...draft.exercises,
        {
          exerciseId: e.id,
          sets: 3,
          mode: e.timed ? "duration" : "reps",
          reps: "8-12",
          duration: 30,
          weight: null,
          rest: 60,
          notes: "",
        },
      ],
    });
    setNotice(`${e.name} added to your workout.`);
  };
  const toggle = (e: Exercise) => {
    if (!userId) {
      onSignIn();
      return;
    }
    void run(async () => {
      const favorite = !favorites.includes(e.id);
      await api("library/favorites", { exerciseId: e.id, favorite }, "PUT");
      setFavorites((old) =>
        favorite ? [...old, e.id] : old.filter((id) => id !== e.id),
      );
    });
  };
  const save = () => {
    if (!userId) {
      onSignIn();
      return;
    }
    void run(async () => {
      const parsed = workoutSchema.safeParse(draft);
      if (!parsed.success)
        throw new Error(
          parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        );
      const { workout } = await api<{ workout: Workout }>(
        `library/workouts${editId ? `/${editId}` : ""}`,
        parsed.data,
        editId ? "PUT" : "POST",
      );
      setWorkouts((old) => [
        workout,
        ...old.filter((w) => w.id !== workout.id),
      ]);
      setDirty(false);
      setDraft(blank());
      setEditId(undefined);
      setNotice("Workout saved to your account.");
      go("saved");
    });
  };
  const edit = (w: Workout) => {
    if (dirty && !window.confirm("Replace your current unsaved workout draft?"))
      return;
    setDraft({
      name: w.name,
      description: w.description,
      exercises: w.exercises.map((e) => ({ ...e })),
      updatedAt: w.updatedAt,
    });
    setEditId(w.id);
    setDirty(false);
    setView(null);
    go("builder");
  };
  const duplicate = (w: Workout) =>
    void run(async () => {
      const { workout } = await api<{ workout: Workout }>("library/workouts", {
        name: `${w.name.slice(0, 113)} (copy)`,
        description: w.description,
        exercises: w.exercises,
      });
      setWorkouts((old) => [workout, ...old]);
      setNotice("Independent workout copy saved.");
    });
  const favoriteWorkout = (w: Workout) =>
    void run(async () => {
      const { workout } = await api<{ workout: Workout }>(
        `library/workouts/${w.id}`,
        { favorite: !w.favorite },
        "PATCH",
      );
      setWorkouts((old) => old.map((v) => (v.id === w.id ? workout : v)));
      if (view?.id === w.id) setView(workout);
    });
  const remove = () => {
    if (!deleting) return;
    void run(async () => {
      await api(`library/workouts/${deleting.id}`, {}, "DELETE");
      setWorkouts((old) => old.filter((w) => w.id !== deleting.id));
      if (view?.id === deleting.id) setView(null);
      if (editId === deleting.id) {
        setEditId(undefined);
        setDirty(true);
      }
      setDeleting(null);
      setNotice("Workout deleted.");
    });
  };
  const filtered = filterExercises(
    page === "favorites"
      ? exercises.filter((e) => favorites.includes(e.id))
      : exercises,
    query,
    muscle,
    equipment,
    difficulty,
    sort,
  ).filter((e) => !pattern || movementPattern[e.id] === pattern);
  const listed = workouts
    .filter(
      (w) =>
        w.name.toLowerCase().includes(workoutQuery.toLowerCase()) &&
        (!favoriteOnly || w.favorite),
    )
    .sort((a, b) =>
      workoutSort === "name"
        ? a.name.localeCompare(b.name)
        : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  const open = (e: Exercise) => {
    setDetail(e);
    setGallery(0);
  };
  const actions = (w: Workout) => (
    <div className="row wrap">
      <button className="btn secondary" disabled={busy} onClick={() => edit(w)}>
        Edit Workout
      </button>
      <button
        className="btn secondary"
        disabled={busy}
        onClick={() => duplicate(w)}
      >
        <Copy size={15} /> Duplicate
      </button>
      <button
        className="btn secondary"
        disabled={busy}
        onClick={() => {
          setView(null);
          setDeleting(w);
        }}
      >
        <Trash2 size={15} /> Delete
      </button>
    </div>
  );
  if (!catalogReady)
    return (
      <section className="exercise-hub" role="status">
        Loading exercise library…
      </section>
    );
  return (
    <section className="exercise-hub">
      <nav className="exercise-tabs" aria-label="Exercises and workouts">
        {tabs.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            aria-current={page === id ? "page" : undefined}
            className={page === id ? "active" : ""}
            onClick={(e) => {
              e.preventDefault();
              go(id);
            }}
          >
            {label}
            {id === "builder" && draft.exercises.length > 0 && (
              <span>{draft.exercises.length}</span>
            )}
          </a>
        ))}
      </nav>
      <div className="exercise-hero">
        <div>
          <p className="eyebrow">THE FIRSTREP MOVEMENT LIBRARY</p>
          <h1>
            {page === "saved" ? (
              <>
                Your work.
                <br />
                <em>Ready to repeat.</em>
              </>
            ) : page === "builder" ? (
              <>
                Make it
                <br />
                <em>your workout.</em>
              </>
            ) : page === "favorites" ? (
              <>
                Your favorites.
                <br />
                <em>One rep closer.</em>
              </>
            ) : (
              <>
                Discover your
                <br />
                <em>next exercise.</em>
              </>
            )}
          </h1>
          <p className="muted">
            {page === "builder"
              ? "Choose your movements. Set your intention. Build a routine that fits."
              : page === "saved"
                ? "Your personal collection of routines, ready whenever you are."
                : "Explore the movements. Learn the technique. Build your next great session."}
          </p>
        </div>
        <div className="exercise-hero-stat">
          <Dumbbell size={30} strokeWidth={1.3} />
          <strong>
            {page === "saved" ? workouts.length : exercises.length}
          </strong>
          <span>
            {page === "saved"
              ? "SAVED ROUTINES"
              : "MOVEMENTS. YOUR POSSIBILITIES."}
          </span>
        </div>
      </div>
      {!userId && (
        <div className="exercise-signin">
          <span>
            Make it yours. Sign in to keep favorites and save workouts to your
            account.
          </span>
          <button className="btn secondary" onClick={onSignIn}>
            Sign in <ArrowUpRight size={16} />
          </button>
        </div>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}{" "}
          <button className="btn secondary" onClick={() => void reload()}>
            Reload saved data
          </button>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          <Check size={16} /> {notice}
          {page !== "builder" && dirty && (
            <button className="btn secondary" onClick={() => go("builder")}>
              Open builder
            </button>
          )}
        </div>
      )}
      {loading && (
        <div className="exercise-skeleton" role="status">
          Loading your saved collection…
        </div>
      )}
      {page === "saved" ? (
        <>
          <div className="workout-toolbar">
            <Field label="Search workouts">
              <input
                type="search"
                value={workoutQuery}
                onChange={(e) => setWorkoutQuery(e.target.value)}
                placeholder="Find a routine…"
              />
            </Field>
            <Field label="Sort workouts">
              <select
                aria-label="Sort workouts"
                value={workoutSort}
                onChange={(e) => setWorkoutSort(e.target.value)}
              >
                <option value="recent">Recently updated</option>
                <option value="name">Alphabetical</option>
              </select>
            </Field>
            <button
              className={`btn secondary ${favoriteOnly ? "selected" : ""}`}
              aria-pressed={favoriteOnly}
              onClick={() => setFavoriteOnly(!favoriteOnly)}
            >
              <Heart size={16} /> Favorite Workouts
            </button>
            <button className="btn primary" onClick={() => go("builder")}>
              <Plus size={16} /> Build Workout
            </button>
          </div>
          <div className="exercise-grid">
            {listed.map((w) => {
              const e = byId.get(w.exercises[0]?.exerciseId);
              return (
                <article className="exercise-card" key={w.id}>
                  <div className="exercise-visual">
                    {e && (
                      <button
                        className="exercise-image-button"
                        onClick={() => setView(w)}
                        aria-label={`View ${w.name}`}
                      >
                        <Image
                          src={e.images[0]}
                          alt={`${e.name}, part of ${w.name}`}
                          fill
                          sizes="(max-width:600px) 90vw, 30vw"
                        />
                      </button>
                    )}
                    <FavoriteButton
                      active={w.favorite}
                      click={() => favoriteWorkout(w)}
                      busy={busy}
                      label={w.name}
                    />
                  </div>
                  <div className="exercise-card-body">
                    <p className="eyebrow">
                      Updated {new Date(w.updatedAt).toLocaleDateString()}
                    </p>
                    <button
                      className="exercise-title"
                      onClick={() => setView(w)}
                    >
                      <h3>{w.name}</h3>
                      <ArrowUpRight size={18} />
                    </button>
                    {w.description && (
                      <p className="muted workout-description">
                        {w.description}
                      </p>
                    )}
                    <Summary items={w.exercises} byId={byId} />
                    <button className="btn primary" onClick={() => setView(w)}>
                      View Workout
                    </button>
                    {actions(w)}
                  </div>
                </article>
              );
            })}
          </div>
          {!loading && !error && !listed.length && (
            <div className="exercise-empty">
              <Dumbbell size={36} />
              <h2>
                {workouts.length
                  ? "No matching workouts."
                  : "No workouts saved yet."}
              </h2>
              <p className="muted">
                A great session starts with a few good movements.
              </p>
              <button className="btn primary" onClick={() => go("builder")}>
                Create Your First Workout
              </button>
            </div>
          )}
        </>
      ) : (
        <div className={page === "builder" ? "workout-layout" : ""}>
          <div>
            <div className="exercise-search">
              <Search size={21} />
              <input
                type="search"
                aria-label="Search exercises"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(24);
                }}
                placeholder="Find your movement. Try “bench press”…"
              />
              <button
                className="btn secondary"
                aria-expanded={filters}
                onClick={() => setFilters(!filters)}
              >
                <SlidersHorizontal size={17} /> Filters
              </button>
            </div>
            <div className="muscle-chips">
              <button
                className={!muscle ? "active" : ""}
                onClick={() => setMuscle("")}
              >
                All muscles
              </button>
              {[...new Set(exercises.map((e) => e.primary))].sort().map((m) => (
                <button
                  key={m}
                  className={muscle === m ? "active" : ""}
                  onClick={() => {
                    setMuscle(m);
                    setLimit(24);
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className={`exercise-filters ${filters ? "expanded" : ""}`}>
              <Field label="Equipment">
                <select
                  aria-label="Equipment"
                  value={equipment}
                  onChange={(e) => {
                    setEquipment(e.target.value);
                    setLimit(24);
                  }}
                >
                  <option value="">All equipment</option>
                  {[...new Set(exercises.map((e) => e.equipment))]
                    .sort()
                    .map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                </select>
              </Field>
              <Field label="Difficulty">
                <select
                  aria-label="Difficulty"
                  value={difficulty}
                  onChange={(e) => {
                    setDifficulty(e.target.value);
                    setLimit(24);
                  }}
                >
                  <option value="">All levels</option>
                  {["Beginner", "Intermediate", "Advanced"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="Sort by">
                <select
                  aria-label="Sort exercises"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="name">Alphabetical</option>
                  <option value="difficulty">Difficulty</option>
                  <option value="muscle">Muscle group</option>
                </select>
              </Field>
              <button
                className="btn secondary"
                onClick={() => {
                  setQuery("");
                  setMuscle("");
                  setEquipment("");
                  setDifficulty("");
                }}
              >
                Clear all filters
              </button>
            </div>
            <div className="exercise-results">
              <span>
                <strong>{filtered.length}</strong>{" "}
                {page === "favorites" ? "favorite exercises" : "exercises"} to
                explore
              </span>
              <span className="muted">FIND YOUR NEXT REP</span>
            </div>
            <div className="exercise-grid">
              {filtered.slice(0, limit).map((e) => (
                <ExerciseCard
                  key={e.id}
                  exercise={e}
                  favorite={favorites.includes(e.id)}
                  busy={busy || loading}
                  toggle={() => toggle(e)}
                  add={() => add(e)}
                  open={() => open(e)}
                />
              ))}
            </div>
            {filtered.length > limit && (
              <button
                className="btn secondary load-more"
                onClick={() => setLimit(limit + 24)}
              >
                Show more exercises ({filtered.length - limit} remaining)
              </button>
            )}
            {!filtered.length && (
              <div className="exercise-empty">
                <Search size={30} />
                <h2>
                  {page === "favorites" && !favorites.length
                    ? "Your favorites start here."
                    : "No exercises found."}
                </h2>
                <p className="muted">
                  {page === "favorites" && !favorites.length
                    ? "Tap a heart in the library to keep a movement close."
                    : "Try another search or clear your filters."}
                </p>
              </div>
            )}
          </div>
          {page === "builder" && (
            <fieldset
              className="workout-builder"
              disabled={busy}
              aria-label="Workout editor"
            >
              <div className="row between">
                <div>
                  <p className="eyebrow">YOUR SESSION</p>
                  <h2>{editId ? "Edit workout" : "Build your workout"}</h2>
                </div>
                <Dumbbell className="accent" />
              </div>
              <Field label="Workout name">
                <input
                  maxLength={120}
                  placeholder="Upper Body Strength"
                  value={draft.name}
                  onChange={(e) => change({ ...draft, name: e.target.value })}
                />
              </Field>
              <Field label="Description (optional)">
                <textarea
                  rows={3}
                  maxLength={20000}
                  placeholder="What are you working toward?"
                  value={draft.description}
                  onChange={(e) =>
                    change({ ...draft, description: e.target.value })
                  }
                />
              </Field>
              <Summary items={draft.exercises} byId={byId} />
              {draft.exercises.map((item, index) => (
                <WorkoutExerciseItem
                  key={`${item.exerciseId}-${index}`}
                  item={item}
                  index={index}
                  total={draft.exercises.length}
                  byId={byId}
                  change={(value) =>
                    change({
                      ...draft,
                      exercises: draft.exercises.map((v, i) =>
                        i === index ? value : v,
                      ),
                    })
                  }
                  remove={() =>
                    change({
                      ...draft,
                      exercises: draft.exercises.filter((_, i) => i !== index),
                    })
                  }
                  move={(offset) => {
                    const items = [...draft.exercises];
                    [items[index], items[index + offset]] = [
                      items[index + offset],
                      items[index],
                    ];
                    change({ ...draft, exercises: items });
                  }}
                />
              ))}
              {!draft.exercises.length && (
                <div className="exercise-empty">
                  <Plus size={28} />
                  <p>Add exercises from the library to shape your session.</p>
                </div>
              )}
              <button
                className="btn primary workout-save"
                disabled={busy || !draft.exercises.length}
                onClick={save}
              >
                {busy ? "Saving…" : "Save Workout"}
              </button>
              <p className="muted">
                {dirty
                  ? "Unsaved changes · draft backed up in this browser session."
                  : "Saved routines belong to your account."}
              </p>
              <button
                className="btn secondary"
                onClick={() => {
                  if (
                    !dirty ||
                    window.confirm(
                      "Discard this unsaved workout and start fresh?",
                    )
                  ) {
                    setDraft(blank());
                    setEditId(undefined);
                    setDirty(false);
                  }
                }}
              >
                Start fresh
              </button>
            </fieldset>
          )}
        </div>
      )}
      {detail && (
        <Modal error={error} title={detail.name} close={() => setDetail(null)}>
          <div className="exercise-detail-image">
            <Image
              src={detail.images[gallery]}
              alt={`${detail.name} demonstration ${gallery + 1}`}
              fill
              sizes="(max-width:700px) 90vw, 700px"
            />
          </div>
          {detail.images.length > 1 && (
            <div className="row">
              {detail.images.map((_, i) => (
                <button
                  key={i}
                  className="btn secondary"
                  onClick={() => setGallery(i)}
                  aria-pressed={i === gallery}
                >
                  Image {i + 1}
                </button>
              ))}
            </div>
          )}
          <div className="row wrap">
            <span className="chip">{detail.primary}</span>
            <span className="chip">{detail.equipment}</span>
            <span className="chip">{detail.difficulty}</span>
          </div>
          <p className="muted">
            Secondary muscles: {detail.secondary.join(", ") || "None listed"}
          </p>
          <div className="row wrap">
            <button
              className="btn primary"
              onClick={() => {
                add(detail);
                setDetail(null);
              }}
            >
              <Plus size={16} /> Add to Workout
            </button>
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => toggle(detail)}
            >
              <Heart
                size={16}
                fill={favorites.includes(detail.id) ? "currentColor" : "none"}
              />
              {favorites.includes(detail.id)
                ? "Remove from Favorites"
                : "Add to Favorites"}
            </button>
          </div>
          <h3>How to perform</h3>
          {detail.instructions.length ? (
            <ol>
              {detail.instructions.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ol>
          ) : (
            <p className="muted">
              Technique guidance is awaiting review for this movement. The
              illustration identifies the exercise; it is not a complete
              technique guide.
            </p>
          )}
          {detail.mistakes.length > 0 && (
            <>
              <h3>Common mistakes</h3>
              <ul>
                {detail.mistakes.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
            </>
          )}
          {detail.tips.length > 0 && (
            <>
              <h3>Form tips</h3>
              <ul>
                {detail.tips.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
            </>
          )}
          {detail.source && (
            <a
              className="accent"
              href={detail.source}
              target="_blank"
              rel="noreferrer"
            >
              Technique reference ↗
            </a>
          )}
          <h3>Explore alternatives</h3>
          <p className="muted">
            Other movements for {detail.primary.toLowerCase()}; equipment and
            demands may differ.
          </p>
          <div className="row wrap">
            {exercises
              .filter((e) => e.primary === detail.primary && e.id !== detail.id)
              .slice(0, 3)
              .map((e) => (
                <button
                  className="btn secondary"
                  key={e.id}
                  onClick={() => open(e)}
                >
                  {e.name}
                  <ArrowUpRight size={14} />
                </button>
              ))}
          </div>
        </Modal>
      )}
      {view && (
        <Modal error={error} title={view.name} close={() => setView(null)}>
          <p className="workout-full-description">{view.description}</p>
          <Summary items={view.exercises} byId={byId} />
          <div className="row wrap">
            {actions(view)}
            <FavoriteButton
              active={view.favorite}
              busy={busy}
              click={() => favoriteWorkout(view)}
              label={view.name}
            />
          </div>
          {view.exercises.map((item, i) => {
            const e = byId.get(item.exerciseId)!;
            return (
              <div className="workout-item" key={i}>
                <div className="row">
                  <Image
                    src={e.images[0]}
                    alt={e.name}
                    width={90}
                    height={90}
                  />
                  <div>
                    <p className="eyebrow">
                      {String(i + 1).padStart(2, "0")} / {e.primary}
                    </p>
                    <h3>{e.name}</h3>
                    <p>
                      {item.sets} sets ×{" "}
                      {item.mode === "reps"
                        ? `${item.reps} reps`
                        : `${item.duration} sec`}
                      {item.weight !== null ? ` · ${item.weight} kg` : ""} ·{" "}
                      {item.rest}s rest
                    </p>
                  </div>
                </div>
                {item.notes && <p>{item.notes}</p>}
              </div>
            );
          })}
        </Modal>
      )}
      {deleting && (
        <Modal
          error={error}
          title="Delete workout?"
          close={() => setDeleting(null)}
        >
          <p>
            “{deleting.name}” will be permanently removed from your saved
            workouts.
          </p>
          <div className="row">
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Keep workout
            </button>
            <button className="btn primary" disabled={busy} onClick={remove}>
              {busy ? "Deleting…" : "Delete Workout"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
