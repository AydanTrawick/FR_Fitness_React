"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Check } from "lucide-react";
import { api, errorText } from "@/lib/client";
import {
  evaluateAchievements,
  type AchievementState,
} from "@/lib/achievements/model";
import type { AchievementActivity } from "@/lib/achievements/activity";
import { useStore } from "./store";

type State = AchievementState & { activities?: AchievementActivity[] };
const windows: Record<string, string> = {
  total: "Lifetime",
  single: "Single session",
  day: "One day",
  week: "One week",
  "14d": "Rolling 14 days",
  "30d": "Rolling 30 days",
  streak: "Consecutive days",
};
export function useAchievements(date: string) {
  const { status, logs, ready } = useStore();
  const owner = status.user?.id ?? "guest";
  const generation = useRef(0);
  const [loaded, setLoaded] = useState<{ owner: string; state: State } | null>(
    null,
  );
  const [error, setError] = useState("");
  const update = useCallback(
    (state: State) => setLoaded({ owner, state }),
    [owner],
  );
  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      const next = status.user
        ? await api<State>("achievements", { action: "sync" }, "POST")
        : await Promise.resolve(
            evaluateAchievements({ today: date, facts: [] }),
          );
      if (request !== generation.current) return;
      update(next);
      setError("");
    } catch (e) {
      if (request === generation.current) setError(errorText(e));
    }
  }, [status.user, date, update]);
  useEffect(() => {
    // Synchronize persisted awards after account and saved-log changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ready) void load();
  }, [load, logs, ready]);
  return {
    state: loaded?.owner === owner ? loaded.state : null,
    error,
    setError,
    update,
    load,
  };
}
export default function Achievements({
  date,
  resource,
}: {
  date: string;
  resource: ReturnType<typeof useAchievements>;
}) {
  const { status } = useStore();
  const { state, error, setError, update, load } = resource;
  const [busy, setBusy] = useState(false);
  const [tier, setTier] = useState("all");
  const [filter, setFilter] = useState("all");
  const [kind, setKind] = useState("run");
  async function saveActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (key: string) => Number(data.get(key));
    const body: Record<string, unknown> = {
      id: crypto.randomUUID(),
      date: data.get("date"),
      kind,
    };
    for (const key of [
      "miles",
      "seconds",
      "elevation",
      "minutes",
      "ounces",
      "goalOunces",
      "proteinTarget",
      "calorieTarget",
      "planned",
      "completed",
    ])
      if (data.has(key)) body[key] = value(key);
    for (const key of ["mileSeconds", "fiveKSeconds", "tenKSeconds"])
      if (data.get(key)) body[key] = value(key);
    if (kind === "run")
      body.splits = String(data.get("splits") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number);
    setBusy(true);
    setError("");
    try {
      const next = await api<State>("achievements", body, "POST");
      update(next);
      form.reset();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const field = (
    name: string,
    label: string,
    optional = false,
    step = "any",
  ) => (
    <label key={name}>
      {label}
      <input
        type="number"
        name={name}
        required={!optional}
        min={
          name === "planned" || name === "completed" || name === "elevation"
            ? 0
            : 0.01
        }
        step={step}
      />
    </label>
  );
  return (
    <>
      {error && (
        <div role="alert" className="dh-card">
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {!state && !error && <p role="status">Loading your quests and badges…</p>}
      {status.user && (
        <section className="dh-card achievement-log">
          <h3>Log quest activity</h3>
          <p>
            Workout, food, library, voice, and AI plan progress is tracked
            automatically. Add run, water, mobility, daily nutrition targets,
            and plan adherence here.
          </p>
          <form onSubmit={saveActivity}>
            <label>
              Activity
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="run">Run or walk</option>
                <option value="water">Water</option>
                <option value="mobility">Mobility</option>
                <option value="nutrition">Daily nutrition targets</option>
                <option value="schedule">AI plan adherence</option>
              </select>
            </label>
            <label>
              Date
              <input
                name="date"
                type="date"
                required
                max={date}
                defaultValue={date}
              />
            </label>
            <div key={kind}>
              {kind === "run" && (
                <>
                  {field("miles", "Distance (miles)")}
                  {field("seconds", "Total time (seconds)")}
                  {field("elevation", "Elevation gain (ft)", true)}
                  {field("mileSeconds", "Measured mile time (seconds)", true)}
                  {field("fiveKSeconds", "Measured 5K time (seconds)", true)}
                  {field("tenKSeconds", "Measured 10K time (seconds)", true)}
                  <label>
                    Full mile splits, in seconds, separated by commas
                    <input name="splits" placeholder="540, 550" />
                  </label>
                  <p>
                    Enter measured checkpoint times. Split consistency uses
                    complete mile splits.
                  </p>
                </>
              )}
              {kind === "water" && (
                <>
                  {field("ounces", "Water logged (fl oz)")}
                  {field("goalOunces", "Daily water goal (fl oz)")}
                </>
              )}
              {kind === "mobility" &&
                field("minutes", "Mobility duration (minutes)")}
              {kind === "nutrition" && (
                <>
                  {field("proteinTarget", "Protein target (g)")}
                  {field("calorieTarget", "Calorie target (kcal)")}
                  <p>
                    Compared with saved food logs. Calories count as on target
                    within 5%. Saving replaces the targets for this date.
                  </p>
                </>
              )}
              {kind === "schedule" && (
                <>
                  {field("planned", "Scheduled AI plan workouts", false, "1")}
                  {field(
                    "completed",
                    "Completed scheduled workouts",
                    false,
                    "1",
                  )}
                  <p>
                    Record each day, including rest days with zero workouts.
                    Full 14 or 30 consecutive days are required. Saving replaces
                    this date’s adherence.
                  </p>
                </>
              )}
            </div>
            <button disabled={busy} type="submit">
              {busy ? "Saving…" : "Save activity"}
            </button>
          </form>
          {!!state?.activities?.length && (
            <details>
              <summary>
                Logged quest activity ({state.activities.length})
              </summary>
              <ul>
                {state.activities
                  .slice()
                  .reverse()
                  .slice(0, 30)
                  .map((a) => (
                    <li key={a.id}>
                      {a.date} · {a.kind}
                      {a.kind === "run"
                        ? ` · ${a.miles} miles`
                        : a.kind === "water"
                          ? ` · ${a.ounces} fl oz`
                          : a.kind === "mobility"
                            ? ` · ${a.minutes} min`
                            : ""}
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </section>
      )}
      {state && (
        <>
          <section className="dh-card dh-quests">
            <div className="dh-row">
              <h3>Quests</h3>
              <span className="dh-muted">
                {state.quests.filter((q) => q.complete).length} of 50 completed
              </span>
            </div>
            <p className="dh-muted">
              {state.questXP.toLocaleString()} quest XP earned · Completed
              quests stay earned.
            </p>
            {!status.user && (
              <p>
                Sign in to track your quests, activity, and badges across
                sessions.
              </p>
            )}
            <div className="achievement-filters">
              <label>
                Tier
                <select value={tier} onChange={(e) => setTier(e.target.value)}>
                  <option value="all">All tiers</option>
                  {[
                    "Starter",
                    "Building Habits",
                    "Committed",
                    "Advanced",
                    "Elite",
                  ].map((name, i) => (
                    <option value={i + 1} key={name}>
                      {i + 1} · {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">All quests</option>
                  <option value="open">In progress</option>
                  <option value="complete">Completed</option>
                </select>
              </label>
            </div>
            {state.quests
              .filter(
                (q) =>
                  (tier === "all" || String(q.tier) === tier) &&
                  (filter === "all" || q.complete === (filter === "complete")),
              )
              .map((q) => (
                <article className="dh-quest" key={q.id}>
                  <span
                    className={`dh-quest-count ${q.complete ? "done" : ""}`}
                  >
                    {q.complete ? <Check size={24} /> : q.order}
                  </span>
                  <div>
                    <div className="dh-row">
                      <strong>{q.title}</strong>
                      <b>+{q.xp} XP</b>
                    </div>
                    <p>{q.description}</p>
                    <small>
                      {q.tier_name} · {q.category} · {windows[q.goal.window]}
                    </small>
                    <progress
                      max={q.goal.target}
                      value={q.progress}
                      aria-label={`${q.title} progress`}
                    />
                    <small>
                      {q.complete
                        ? "Completed"
                        : q.goal.metric.endsWith("_max")
                          ? q.value === null
                            ? "No qualifying time logged"
                            : `Best: ${q.value} sec · Target: ≤ ${q.goal.target} sec`
                          : `${(q.value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} / ${q.goal.target.toLocaleString()}`}
                    </small>
                  </div>
                </article>
              ))}
          </section>
          <section className="dh-badges">
            <div className="dh-row">
              <h3>Badges</h3>
              <span className="dh-muted">
                {state.badges.filter((b) => b.earned).length} of 50 earned
              </span>
            </div>
            <div>
              {state.badges.map((b) => (
                <article
                  key={b.id}
                  className={`dh-badge ${b.earned ? "earned" : ""}`}
                >
                  <span aria-hidden="true">{b.icon}</span>
                  <h4>{b.name}</h4>
                  <p>{b.description}</p>
                  <small>
                    {b.rarity} · {b.category}
                  </small>
                  <small>{b.earned ? "Earned" : "Not yet earned"}</small>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
