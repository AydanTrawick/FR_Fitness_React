"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronLeft,
  Dumbbell,
  Flame,
  Home,
  List,
  Mic,
  Plus,
  Sparkles,
  Star,
  Trophy,
  Utensils,
  Zap,
} from "lucide-react";
import { useStore } from "./store";
import { WorkoutCardButton, PRCardEditor } from "./workout-share-cards";
import { api } from "@/lib/client";
import {
  dashboardDate,
  dashboardStats,
  dayLabel,
  shiftDate,
} from "@/lib/dashboard";
import { cardNumber, cardWeight, type CardUnit } from "@/lib/share-cards";
import {
  catalogIndex,
  describeLift,
  estimated1RM,
  groupSessions,
  muscleColors,
  type CatalogLift,
} from "@/lib/workout-session";
import { programs } from "@/lib/program-data";
import { matchesFilters } from "@/lib/programs";
import "./dashboard.css";

type View = "Today" | "Progress" | "Quests";
function Meter({
  value,
  max = 1,
  label,
}: {
  value: number;
  max?: number;
  label: string;
}) {
  return (
    <div
      className="dh-meter"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
    >
      <span style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  );
}
function BodyMap({
  active,
  back = false,
}: {
  active: Set<string>;
  back?: boolean;
}) {
  const color = (muscles: string[]) =>
    muscles.some((m) => active.has(m)) ? "var(--dh-blue)" : "#303035";
  return (
    <svg
      viewBox="0 0 120 230"
      role="img"
      aria-label={`${back ? "Back" : "Front"} view: highlighted muscle groups ${[...active].join(", ") || "none"}`}
    >
      <circle cx="60" cy="19" r="13" fill="#303035" />
      <rect
        x="35"
        y="39"
        width="50"
        height="39"
        rx="12"
        fill={color(back ? ["Back"] : ["Chest"])}
      />
      <rect
        x="40"
        y="80"
        width="40"
        height="29"
        rx="9"
        fill={color(back ? ["Back"] : ["Core"])}
      />
      <rect
        x="17"
        y="43"
        width="14"
        height="68"
        rx="7"
        fill={color(["Arms", "Shoulders"])}
      />
      <rect
        x="89"
        y="43"
        width="14"
        height="68"
        rx="7"
        fill={color(["Arms", "Shoulders"])}
      />
      <rect
        x="36"
        y="114"
        width="22"
        height="64"
        rx="11"
        fill={color(["Legs"])}
      />
      <rect
        x="62"
        y="114"
        width="22"
        height="64"
        rx="11"
        fill={color(["Legs"])}
      />
      <rect
        x="38"
        y="184"
        width="18"
        height="43"
        rx="9"
        fill={color(["Legs"])}
      />
      <rect
        x="64"
        y="184"
        width="18"
        height="43"
        rx="9"
        fill={color(["Legs"])}
      />
    </svg>
  );
}
function ProgramQuiz({ go }: { go: (page: string) => void }) {
  const [step, setStep] = useState(0),
    [days, setDays] = useState("3"),
    [goal, setGoal] = useState("Strength"),
    [length, setLength] = useState("60+");
  const choices =
    step === 0
      ? ["3", "4", "6"]
      : step === 1
        ? ["Strength", "Muscle", "Endurance"]
        : ["<45", "45–60", "60+"];
  const selected = step === 0 ? days : step === 1 ? goal : length;
  const recommendation = [...programs].sort((a, b) => {
    const score = (p: typeof a) =>
      (p.schedule.length === Number(days) ? 4 : 0) +
      (p.goal === goal ? 3 : 0) +
      (matchesFilters(p, "Any", length, "Any") ? 1 : 0);
    return score(b) - score(a);
  })[0];
  return (
    <section className="dh-card dh-quiz">
      <p className="dh-kicker">
        FIND YOUR RHYTHM · {Math.min(step + 1, 3)} OF 3
      </p>
      <h3>
        {
          [
            "How many days a week can you train?",
            "What are you training for?",
            "How long have you got?",
            "Your next chapter starts here.",
          ][step]
        }
      </h3>
      {step < 3 ? (
        <>
          <div className="dh-choices">
            {choices.map((c) => (
              <button
                key={c}
                aria-pressed={c === selected}
                onClick={() =>
                  step === 0
                    ? setDays(c)
                    : step === 1
                      ? setGoal(c)
                      : setLength(c)
                }
              >
                {c}
                {step === 0 && (
                  <small>
                    {c === "3"
                      ? "Full body"
                      : c === "4"
                        ? "Upper / Lower"
                        : "Push / Pull / Legs"}
                  </small>
                )}
              </button>
            ))}
          </div>
          <div
            className="dh-quiz-steps"
            aria-label={`Question ${step + 1} of 3`}
          >
            {[0, 1, 2].map((n) => (
              <i key={n} className={n <= step ? "active" : ""} />
            ))}
          </div>
          <button className="dh-button blue" onClick={() => setStep(step + 1)}>
            {step === 2 ? "Find my program" : "Next question"}{" "}
            <ArrowRight size={18} />
          </button>
          {step > 0 && (
            <button className="dh-text" onClick={() => setStep(step - 1)}>
              Previous question
            </button>
          )}
        </>
      ) : (
        <>
          <p className="dh-match">{recommendation.title}</p>
          <p className="dh-muted">{recommendation.description}</p>
          <a className="dh-button blue" href={`/programs/${recommendation.id}`}>
            Preview your program <ArrowRight size={18} />
          </a>
          <button className="dh-text" onClick={() => go("programs")}>
            Explore all programs
          </button>
          <button className="dh-text" onClick={() => setStep(0)}>
            Retake quiz
          </button>
        </>
      )}
    </section>
  );
}
export default function Dashboard({ go }: { go: (page: string) => void }) {
  const { logs, status } = useStore();
  const [view, setView] = useState<View>("Today"),
    [catalog, setCatalog] = useState<CatalogLift[]>([]),
    [catalogError, setCatalogError] = useState(false),
    [share, setShare] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    let active = true;
    api<{ exercises: CatalogLift[] }>("exercises?limit=1000")
      .then((r) => {
        if (active) setCatalog(r.exercises);
      })
      .catch(() => {
        if (active) setCatalogError(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const date = dashboardDate(now, status.user?.timezone),
    stats = dashboardStats(logs, date);
  const unit: CardUnit = status.user?.weightUnit === "lb" ? "lb" : "kg";
  const [overrideUnit, setOverrideUnit] = useState<CardUnit | null>(null),
    displayUnit = overrideUnit || unit;
  const weight = (kg: number) => cardNumber(cardWeight(kg, displayUnit), 1);
  const compact = (kg: number) =>
    new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(cardWeight(kg, displayUnit));
  const session = groupSessions(stats.workouts, catalog)[0];
  const top = [...stats.workouts].sort(
    (a, b) =>
      estimated1RM(Number(b.weight_kg), Number(b.reps)) -
        estimated1RM(Number(a.weight_kg), Number(a.reps)) ||
      Number(b.reps) - Number(a.reps),
  )[0];
  const topInfo = top && describeLift(top, catalogIndex(catalog));
  const todayCheckin = stats.checkins.some(
    (r) =>
      dashboardDate(new Date(String(r.recorded_at)), status.user?.timezone) ===
      date,
  );
  const closed = [stats.sets > 0, stats.food.length > 0, todayCheckin],
    rings = closed.filter(Boolean).length;
  const xp = stats.totalSets * 10,
    level = Math.floor(xp / 500) + 1,
    titles = [
      "First Rep",
      "Iron Rookie",
      "Barbell Regular",
      "Momentum Maker",
      "Rep Legend",
    ];
  const activeMuscles = new Set(
    session?.groups.filter((g) => g.muscle !== "Other").map((g) => g.muscle) ||
      [],
  );
  const first = status.user?.display_name?.split(" ")[0] || "athlete";
  const changeView = (next: View) => {
    setView(next);
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  const quests = [
    {
      title: "Move 10,000 kg in one day",
      value: stats.weekMaxVolume,
      max: 10000,
      xp: 50,
      action: "workout",
    },
    {
      title: "Train 4 days this week",
      value: stats.weekTraining,
      max: 4,
      xp: 100,
      action: "workout",
    },
    {
      title: "Log food on 3 days this week",
      value: stats.fuelDays,
      max: 3,
      xp: 75,
      action: "food",
    },
    {
      title: "Log a check-in this week",
      value: Number(
        stats.checkins.some(
          (r) =>
            stats.week.includes(
              dashboardDate(
                new Date(String(r.recorded_at)),
                status.user?.timezone,
              ),
            ) &&
            dashboardDate(
              new Date(String(r.recorded_at)),
              status.user?.timezone,
            ) <= date,
        ),
      ),
      max: 1,
      xp: 25,
      action: "bmi",
    },
  ];
  const posterior = groupSessions(
    logs.workout.filter((r) => String(r.date) <= date),
    catalog,
  ).some((s) => {
    const names = s.groups.map((g) => g.name).join(" ");
    return (
      /deadlift|hamstring|leg curl/i.test(names) &&
      /glute|hip thrust|deadlift/i.test(names) &&
      s.groups.some((g) => g.muscle === "Back")
    );
  });
  const badges = [
    {
      name: "First Rep",
      text: "Logged your first set",
      earned: xp > 0,
      Icon: Check,
    },
    {
      name: "Back to Back",
      text: "Trained 2 days in a row",
      earned: stats.bestStreak,
      Icon: Flame,
    },
    {
      name: "Ton Club",
      text: "10,000 kg moved in one day",
      earned: stats.allMaxVolume >= 10000,
      Icon: Dumbbell,
    },
    {
      name: "Posterior Chain",
      text: "Hamstrings, glutes and back in one day",
      earned: posterior,
      Icon: Zap,
    },
    {
      name: "Week Warrior",
      text: "Trained 4 days in a week",
      earned: stats.weekWarrior,
      Icon: Star,
    },
    {
      name: "Fuel Streak",
      text: "Logged food 3 days running",
      earned: stats.fuelStreak,
      Icon: Utensils,
    },
  ];
  const ringActions = ["workout", "food", "bmi"];
  const nextRing = closed.findIndex((c) => !c);
  const knownProtein = stats.food
    .filter((r) => r.protein_g != null)
    .reduce((s, r) => s + Number(r.protein_g), 0);
  return (
    <div className="dashboard-hub">
      <header className="dh-heading">
        <div>
          {view !== "Today" && (
            <button
              className="dh-back"
              aria-label="Back to today"
              onClick={() => changeView("Today")}
            >
              <ChevronLeft size={22} />
            </button>
          )}
          <div>
            <p className="dh-kicker">
              {view === "Today"
                ? dayLabel(date, { weekday: "long" }).toUpperCase() +
                  " · YOUR DAILY MOMENTUM"
                : view === "Progress"
                  ? "PROGRESS"
                  : "THIS WEEK"}
            </p>
            <h1>
              {view === "Today"
                ? `${stats.sets ? "Nice work" : "Let’s get moving"}, ${first}.`
                : view === "Progress"
                  ? "Your week, visualized"
                  : "Little wins. Big momentum."}
            </h1>
          </div>
        </div>
        <span className="dh-streak">
          <Flame size={18} />
          <b>{stats.streak}</b> day streak
        </span>
      </header>
      <nav className="dh-tabs" aria-label="Dashboard views">
        {(["Today", "Progress", "Quests"] as View[]).map((v) => (
          <button
            key={v}
            aria-current={view === v ? "page" : undefined}
            onClick={() => changeView(v)}
          >
            {v === "Today" ? (
              <Home size={17} />
            ) : v === "Progress" ? (
              <BarChart3 size={17} />
            ) : (
              <Trophy size={17} />
            )}{" "}
            {v}
          </button>
        ))}
        <span>Every rep is a beginning.</span>
      </nav>
      {view === "Today" && (
        <>
          <div className="dh-today-intro">
            <p className="dh-muted">
              {rings === 3
                ? "Three rings closed. You showed up for yourself."
                : `${rings === 0 ? "A fresh day" : `${rings} ring${rings === 1 ? "" : "s"} closed`}. ${3 - rings} little wins to aim for.`}
            </p>
            <div className="dh-week">
              {stats.week.map((d) => (
                <div key={d}>
                  <span
                    className={`${stats.trainingDays.has(d) ? "done" : ""} ${d === date ? "current" : ""}`}
                    aria-label={`${d}${stats.trainingDays.has(d) ? ": trained" : ": no workout logged"}${d === date ? ", today" : ""}`}
                  >
                    {stats.trainingDays.has(d) ? (
                      <Check size={19} />
                    ) : (
                      dayLabel(d, { day: "numeric" })
                    )}
                  </span>
                  <small>{dayLabel(d, { weekday: "narrow" })}</small>
                </div>
              ))}
            </div>
          </div>
          <div className="dh-layout dh-layout-today">
            <div className="dh-column">
              <section className="dh-card dh-rings-card">
                <div className="dh-rings-layout">
                  <div className="dh-rings">
                    <svg
                      viewBox="0 0 220 220"
                      role="img"
                      aria-label={`${rings} of 3 daily logging rings closed. Train ${closed[0] ? "done" : "open"}, Fuel ${closed[1] ? "done" : "open"}, Check-in ${closed[2] ? "done" : "open"}`}
                    >
                      {[94, 73, 52].map((r, i) => (
                        <g
                          key={r}
                          style={{
                            color: [
                              "var(--dh-blue)",
                              "var(--dh-orange)",
                              "var(--dh-purple)",
                            ][i],
                          }}
                        >
                          <circle
                            cx="110"
                            cy="110"
                            r={r}
                            className="dh-ring-track"
                          />
                          <circle
                            cx="110"
                            cy="110"
                            r={r}
                            className="dh-ring-fill"
                            strokeDasharray={`${2 * Math.PI * r}`}
                            strokeDashoffset={
                              2 * Math.PI * r * (closed[i] ? 0 : 0.975)
                            }
                            transform="rotate(-90 110 110)"
                          />
                        </g>
                      ))}
                    </svg>
                    <div>
                      <strong>{rings}/3</strong>
                      <small>rings closed</small>
                    </div>
                  </div>
                  <div className="dh-ring-legend">
                    {["Train", "Fuel", "Check-in"].map((label, i) => (
                      <button key={label} onClick={() => go(ringActions[i])}>
                        <b>{label}</b>
                        <span>
                          {i === 0
                            ? `${stats.sets} sets${stats.sets ? " · done" : ""}`
                            : i === 1
                              ? stats.food.length
                                ? stats.food.every((r) => r.protein_g == null)
                                  ? "Protein not provided"
                                  : `${Math.round(knownProtein)} g${stats.food.some((r) => r.protein_g == null) ? " known" : ""} protein`
                                : "Log your first meal"
                              : todayCheckin
                                ? "Check-in logged"
                                : "Add a measurement"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="dh-actions">
                  <button
                    className="dh-button blue"
                    onClick={() =>
                      go(nextRing < 0 ? "workout" : ringActions[nextRing])
                    }
                  >
                    {nextRing < 0
                      ? "Keep the momentum"
                      : `Close ${["Train", "Fuel", "Check-in"][nextRing]} ring`}
                    <ArrowRight size={18} />
                  </button>
                  <button className="dh-button" onClick={() => go("programs")}>
                    Programs
                  </button>
                </div>
                <p className="dh-fine">
                  A set, a meal, a check-in. Each logged action closes a ring.
                </p>
              </section>
              <section className="dh-card dh-xp">
                <div className="dh-row">
                  <span className="dh-level">L{level}</span>
                  <div>
                    <h3>{titles[Math.min(level - 1, titles.length - 1)]}</h3>
                    <p className="dh-muted">
                      {level < titles.length
                        ? `Next: ${titles[level]}`
                        : "Keep building your story"}
                    </p>
                  </div>
                  <b>+{stats.sets * 10} XP today</b>
                </div>
                <Meter
                  value={xp % 500}
                  max={500}
                  label="Training XP toward next level"
                />
                <p className="dh-fine">
                  10 XP per logged set · {xp % 500} / 500 to level {level + 1}
                </p>
              </section>
              <section className="dh-card dh-refuel">
                <div className="dh-row">
                  <span className="dh-icon">
                    <Utensils />
                  </span>
                  <div>
                    <h3>
                      {stats.sets
                        ? "Refuel after your workout"
                        : "Fuel your next rep"}
                    </h3>
                    <p>Keep your meals and protein in view.</p>
                  </div>
                </div>
                <div className="dh-actions">
                  <button className="dh-button" onClick={() => go("food")}>
                    + Log a meal
                  </button>
                  <button className="dh-button" onClick={() => go("food")}>
                    Search foods <ArrowRight size={16} />
                  </button>
                </div>
              </section>
            </div>
            <div className="dh-column">
              <section className="dh-card dh-session">
                <div className="dh-row dh-session-head">
                  <div>
                    <p className="dh-kicker">TODAY’S TRAINING</p>
                    <h3>
                      {session
                        ? `${session.groups.length} lift${session.groups.length === 1 ? "" : "s"}. All you.`
                        : "Your next rep starts here."}
                    </h3>
                  </div>
                  <span className={`dh-tag ${session ? "green" : ""}`}>
                    {session ? "Logged" : "Fresh start"}
                  </span>
                </div>
                {session ? (
                  <>
                    <div className="dh-session-stats">
                      <div>
                        <strong>{session.groups.length}</strong>
                        <small>exercises</small>
                      </div>
                      <div>
                        <strong>{session.sets}</strong>
                        <small>sets</small>
                      </div>
                      <div>
                        <strong>{compact(session.volumeKg)}</strong>
                        <small>{displayUnit} moved</small>
                      </div>
                    </div>
                    <div className="dh-lifts">
                      {session.groups.slice(0, 4).map((g) => {
                        const r = g.rows.at(-1)!;
                        return (
                          <div key={g.key}>
                            <i style={{ background: muscleColors[g.muscle] }} />
                            <strong>{g.name}</strong>
                            <span>
                              {g.bodyweight ? "+" : ""}
                              {weight(Number(r.weight_kg))} {displayUnit} ×{" "}
                              {r.reps}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="dh-session-links">
                      <button className="dh-text" onClick={() => go("workout")}>
                        See full session <ArrowRight size={16} />
                      </button>
                      <WorkoutCardButton
                        rows={stats.workouts}
                        initialDate={date}
                        initialUnit={displayUnit}
                        buttonLabel="Share workout card"
                        buttonClassName="dh-button"
                      />
                    </div>
                  </>
                ) : (
                  <div className="dh-empty">
                    <span className="dh-empty-icon">
                      <Dumbbell size={34} />
                    </span>
                    <p>
                      No workout logged today. One set is all it takes to get
                      started.
                    </p>
                    <button
                      className="dh-button blue"
                      onClick={() => go("workout")}
                    >
                      Log your first set <Plus size={18} />
                    </button>
                  </div>
                )}
              </section>
              <button
                className="dh-card dh-next"
                onClick={() => go("programs")}
              >
                <span className="dh-icon">
                  <Sparkles size={22} />
                </span>
                <div>
                  <p className="dh-kicker">YOUR NEXT CHAPTER</p>
                  <h3>Find a plan you’ll show up for.</h3>
                  <p className="dh-muted">
                    A little structure goes a long way.
                  </p>
                </div>
                <ArrowRight size={20} />
              </button>
              <button
                className="dh-card dh-coach-teaser"
                onClick={() => go("assistant")}
              >
                <span className="dh-icon">
                  <Mic />
                </span>
                <div>
                  <h3>Your coach is a tap away.</h3>
                  <p className="dh-muted">
                    Talk training, swap a lift, or find your next step.
                  </p>
                </div>
                <ArrowRight size={20} />
              </button>
              <button className="dh-text" onClick={() => changeView("Quests")}>
                Discover your weekly quests <Trophy size={17} />
              </button>
            </div>
          </div>
        </>
      )}
      {view === "Progress" && (
        <>
          <div className="dh-progress-toolbar">
            <p className="dh-muted">Your effort, in a whole new light.</p>
            <div className="dh-unit" aria-label="Progress display unit">
              {(["lb", "kg"] as CardUnit[]).map((u) => (
                <button
                  key={u}
                  aria-pressed={displayUnit === u}
                  onClick={() => setOverrideUnit(u)}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <div className="dh-layout">
            <div className="dh-column">
              <section className="dh-card dh-top-set">
                <p className="dh-kicker">TOP SET OF THE DAY</p>
                {top ? (
                  <>
                    <div className="dh-confetti" aria-hidden="true">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <i key={i} />
                      ))}
                    </div>
                    <h3>{top.exercise}</h3>
                    <p className="dh-big-weight">
                      {topInfo?.bodyweight ? "+" : ""}
                      {weight(Number(top.weight_kg))}{" "}
                      <span>
                        {displayUnit} × {top.reps}
                      </span>
                    </p>
                    <p>
                      Estimated 1-rep max ≈{" "}
                      {weight(
                        estimated1RM(Number(top.weight_kg), Number(top.reps)),
                      )}{" "}
                      {displayUnit}
                      {topInfo?.bodyweight ? " added weight" : ""} (Epley)
                    </p>
                    <div className="dh-actions">
                      <button
                        className="dh-button orange"
                        onClick={() => setShare(true)}
                      >
                        Share this lift
                      </button>
                      <button
                        className="dh-button"
                        onClick={() => go("workout")}
                      >
                        Lift history
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3>A great lift is waiting.</h3>
                    <p className="dh-muted">
                      Log a set to see your top lift and estimated 1-rep max.
                    </p>
                    <button
                      className="dh-button orange"
                      onClick={() => go("workout")}
                    >
                      Log a workout <ArrowRight size={17} />
                    </button>
                  </>
                )}
              </section>
              <section className="dh-card">
                <div className="dh-row">
                  <h3>Muscles you hit today</h3>
                  <span className="dh-muted">Front · Back</span>
                </div>
                <div className="dh-body">
                  <BodyMap active={activeMuscles} />
                  <BodyMap active={activeMuscles} back />
                </div>
                <div className="dh-muscle-chips">
                  {[...activeMuscles].map((m) => (
                    <span key={m}>
                      {m} ·{" "}
                      {session?.groups.filter((g) => g.muscle === m).length}{" "}
                      {session?.groups.filter((g) => g.muscle === m).length ===
                      1
                        ? "lift"
                        : "lifts"}
                    </span>
                  ))}
                </div>
                <p className="dh-fine">
                  {catalogError
                    ? "Muscle detail is unavailable right now. Your logged sets are still shown."
                    : activeMuscles.size
                      ? "Highlights show muscle groups from the exercise catalog."
                      : "Log a catalog exercise to light up your muscle map."}
                </p>
              </section>
            </div>
            <div className="dh-column">
              <section className="dh-card dh-volume">
                <p className="dh-kicker">TRAINING VOLUME · LAST 7 DAYS</p>
                <h2>
                  {weight(stats.days.reduce((s, d) => s + d.volume, 0))}{" "}
                  <small>{displayUnit}</small>
                </h2>
                <p className="dh-accent">
                  {stats.weekTraining
                    ? `${stats.weekTraining} training day${stats.weekTraining === 1 ? "" : "s"} this week. Every one counts.`
                    : "Your first training day is ahead of you."}
                </p>
                <div
                  className="dh-chart"
                  role="img"
                  aria-label={stats.days
                    .map((d) => `${d.date}: ${weight(d.volume)} ${displayUnit}`)
                    .join("; ")}
                >
                  {stats.days.map((d) => (
                    <div key={d.date}>
                      <span>{d.volume ? compact(d.volume) : ""}</span>
                      <div className="dh-chart-track">
                        <i
                          className={`${d.date === date ? "today" : ""} ${d.volume === 0 ? "empty" : ""}`}
                          style={{
                            height: `${Math.max(2, (d.volume / Math.max(1, ...stats.days.map((x) => x.volume))) * 100)}%`,
                          }}
                        />
                      </div>
                      <small>{dayLabel(d.date, { weekday: "short" })}</small>
                    </div>
                  ))}
                </div>
                <div className="dh-comparison">
                  <Dumbbell size={26} />
                  <p>
                    {stats.volume > 0 ? (
                      <>
                        Today you moved about the weight of{" "}
                        <strong>
                          {stats.volume >= 1200
                            ? `${cardNumber(stats.volume / 1200, 1)} compact cars`
                            : `${cardNumber(stats.volume / 20, 1)} packed suitcases`}
                        </strong>
                        .
                      </>
                    ) : (
                      "Your next session adds another bar to your story."
                    )}
                  </p>
                </div>
                <p className="dh-fine">
                  Comparisons use approximate weights; volume is weight × reps ×
                  sets.
                </p>
              </section>
              <section className="dh-card">
                <div className="dh-row">
                  <h3>Consistency</h3>
                  <span className="dh-muted">
                    {stats.weekTraining} days this week
                  </span>
                </div>
                <div className="dh-calendar">
                  <div className="dh-calendar-labels">
                    {"MTWTFSS".split("").map((d, i) => (
                      <span key={i}>{d}</span>
                    ))}
                  </div>
                  <div className="dh-calendar-grid">
                    {Array.from({ length: 28 }, (_, i) =>
                      shiftDate(stats.week[0], i - 21),
                    ).map((d) => {
                      const count = logs.workout
                        .filter((r) => r.date === d)
                        .reduce((s, r) => s + Number(r.sets), 0);
                      return (
                        <span
                          key={d}
                          className={`${d > date ? "future" : ""} ${d === date ? "current" : ""} ${count > 0 ? "trained" : ""} ${count >= 10 ? "intense" : ""}`}
                          title={`${d}: ${count} sets`}
                          aria-label={`${d}: ${count} sets`}
                        >
                          {dayLabel(d, { day: "numeric" })}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="dh-heat-legend">
                  Less <i />
                  <i />
                  <i /> More
                </div>
              </section>
            </div>
          </div>
        </>
      )}
      {view === "Quests" && (
        <div className="dh-layout">
          <div className="dh-column">
            <section className="dh-card dh-quests">
              <div className="dh-row">
                <h3>This week’s quests</h3>
                <span className="dh-muted">Resets Monday</span>
              </div>
              {quests.map((q) => (
                <button
                  key={q.title}
                  className="dh-quest"
                  onClick={() => go(q.action)}
                >
                  <span
                    className={`dh-quest-count ${q.value >= q.max ? "done" : ""}`}
                  >
                    {q.value >= q.max ? (
                      <Check size={24} />
                    ) : q.max === 10000 ? (
                      `${Math.floor(q.value / 1000)}k`
                    ) : (
                      Math.min(q.value, q.max) + "/" + q.max
                    )}
                  </span>
                  <div>
                    <div className="dh-row">
                      <strong>{q.title}</strong>
                      <b>+{q.xp} XP</b>
                    </div>
                    <Meter value={q.value} max={q.max} label={q.title} />
                  </div>
                </button>
              ))}
              <p className="dh-fine">
                {quests
                  .filter((q) => q.value >= q.max)
                  .reduce((s, q) => s + q.xp, 0)}{" "}
                challenge XP earned this week · Training levels use set XP.
              </p>
            </section>
            <section className="dh-badges">
              <div className="dh-row">
                <h3>Badges</h3>
                <span className="dh-muted">
                  {badges.filter((b) => b.earned).length} of 6 earned
                </span>
              </div>
              <div>
                {badges.map(({ name, text, earned, Icon }) => (
                  <article
                    key={name}
                    className={`dh-badge ${earned ? "earned" : ""}`}
                  >
                    <span>
                      <Icon size={27} />
                    </span>
                    <h4>{name}</h4>
                    <p>{text}</p>
                    <small>{earned ? "Earned" : "Not yet earned"}</small>
                  </article>
                ))}
              </div>
            </section>
          </div>
          <div className="dh-column">
            <ProgramQuiz go={go} />
            <section className="dh-card dh-coach">
              <div className="dh-row">
                <span className="dh-mic">
                  <Mic size={26} />
                </span>
                <div>
                  <h3>Ask your coach</h3>
                  <p className="dh-muted">
                    A little guidance. A lot of possibility.
                  </p>
                </div>
              </div>
              <p className="dh-coach-question">
                “What should I train tomorrow?”
              </p>
              <p className="dh-coach-question">“How can I swap an exercise?”</p>
              <button className="dh-button" onClick={() => go("assistant")}>
                Open training assistant <ArrowRight size={18} />
              </button>
            </section>
          </div>
        </div>
      )}
      <nav className="dh-dock" aria-label="Quick dashboard navigation">
        <button
          aria-current={view === "Today" ? "page" : undefined}
          onClick={() => changeView("Today")}
        >
          <Home size={21} />
          Home
        </button>
        <button onClick={() => go("workout")}>
          <List size={21} />
          Log
        </button>
        <button
          className="dh-add"
          aria-label="Log a workout"
          onClick={() => go("workout")}
        >
          <Plus size={30} />
        </button>
        <button
          aria-current={view === "Progress" ? "page" : undefined}
          onClick={() => changeView("Progress")}
        >
          <BarChart3 size={21} />
          Progress
        </button>
        <button
          aria-current={view === "Quests" ? "page" : undefined}
          onClick={() => changeView("Quests")}
        >
          <Trophy size={21} />
          Quests
        </button>
      </nav>
      {share && top && (
        <PRCardEditor
          data={{
            date,
            exercise: String(top.exercise),
            weight: cardWeight(Number(top.weight_kg), displayUnit),
            reps: Number(top.reps),
            unit: displayUnit,
            bodyweight: topInfo?.bodyweight,
          }}
          onClose={() => setShare(false)}
        />
      )}
    </div>
  );
}
