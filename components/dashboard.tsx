"use client";
import { BrandLogo } from "./brand-logo";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Dumbbell,
  Flame,
  Scale,
  Sparkles,
  Utensils,
} from "lucide-react";
import { useStore } from "./store";
import { Card, Empty, Metric, PageTitle, TextLink } from "./ui";
import { bmi, bmiCategory, calories, today, volume } from "@/lib/tracking";
import content from "@/lib/content.json";
export default function Dashboard({ go }: { go: (page: string) => void }) {
  const { logs, status } = useStore();
  const date = today();
  const workouts = logs.workout.filter((row) => row.date === date);
  const food = logs.food.filter((row) => row.date === date);
  const latest = [...logs.bmi].sort((a, b) =>
    String(b.recorded_at).localeCompare(String(a.recorded_at)),
  )[0];
  const recent = [
    ...logs.workout.map((row) => ({
      ...row,
      kind: "workout",
      title: row.exercise,
      detail: `${row.sets} × ${row.reps} · ${Number(row.weight_kg).toFixed(1)} kg`,
      time: String(row.date),
    })),
    ...logs.food.map((row) => ({
      ...row,
      kind: "food",
      title: row.food,
      detail: `${Math.round(calories(row))} kcal`,
      time: String(row.date),
    })),
  ]
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, 4);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
      key,
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      total: logs.workout
        .filter((r) => r.date === key)
        .reduce((s, r) => s + volume(r), 0),
    };
  });
  const max = Math.max(1, ...days.map((d) => d.total));
  return (
    <>
      <PageTitle
        eyebrow="YOUR DAILY STARTING POINT"
        title={
          status.user
            ? `Welcome back, ${status.user.display_name.split(" ")[0]}.`
            : "Your next chapter starts here."
        }
        description="A little stronger. A little more consistent. One rep at a time."
        action={
          <span className="date-chip">
            <CalendarDays size={16} />
            {new Date().toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        }
      />
      <section className="hero">
        <div className="hero-copy">
          <span className="pill">
            <span className="dot" /> BUILT FOR YOUR EVERYDAY
          </span>
          <h2>
            Big progress.
            <br />
            <span>Small, daily reps.</span>
          </h2>
          <p>
            Your training, nutrition, and progress.
            <br />
            Together in one place, starting with today.
          </p>
          <button className="btn primary" onClick={() => go("workout")}>
            Log a workout <ArrowRight size={17} />
          </button>
          <button className="hero-secondary" onClick={() => go("programs")}>
            Explore programs <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="hero-emblem">
            <BrandLogo size={172} />
          </div>
          <span className="art-coordinate">FIRSTREP / EVERY REP COUNTS</span>
        </div>
      </section>
      <div className="metrics-grid">
        <Metric
          label="Training today"
          value={workouts.reduce((s, r) => s + Number(r.sets), 0)}
          unit="sets"
          icon={Dumbbell}
          note={`${new Set(workouts.map((r) => r.exercise)).size} exercises logged`}
        />
        <Metric
          label="Nutrition today"
          value={Math.round(
            food.reduce((s, r) => s + calories(r), 0),
          ).toLocaleString()}
          unit="kcal"
          icon={Flame}
          note={`${food.reduce((s, r) => s + Number(r.protein_g), 0).toFixed(0)} g protein · ${food.length} foods logged`}
        />
        <Metric
          label="Latest BMI"
          value={latest ? bmi(latest).toFixed(1) : "—"}
          icon={Scale}
          note={
            latest ? bmiCategory(bmi(latest)) : "Add your first measurement"
          }
        />
        <Metric
          label="Training days"
          value={new Set(logs.workout.map((r) => r.date)).size}
          unit="total"
          icon={Activity}
          note="Every session is a step forward"
        />
      </div>
      <div className="dashboard-grid">
        <Card>
          <div className="section-top">
            <div>
              <p className="eyebrow">KEEP THE MOMENTUM</p>
              <h3>Your week in training</h3>
            </div>
            <span className="chip">Last 7 days</span>
          </div>
          <div
            className="chart"
            role="img"
            aria-label={days
              .map((d) => `${d.label}: ${Math.round(d.total)} kilograms volume`)
              .join(", ")}
          >
            {days.map((d) => (
              <div className="chart-column" key={d.key}>
                <span className="chart-value">
                  {d.total > 0 ? Math.round(d.total).toLocaleString() : "—"}
                </span>
                <div className="chart-track">
                  <div
                    className={d.key === date ? "chart-bar today" : "chart-bar"}
                    style={{ height: `${Math.max(3, (d.total / max) * 100)}%` }}
                  />
                </div>
                <span className={d.key === date ? "accent" : "muted"}>
                  {d.label}
                </span>
              </div>
            ))}
          </div>
          <div className="row between chart-footer">
            <span className="muted">Training volume · kg</span>
            <TextLink onClick={() => go("workout")}>View workout log</TextLink>
          </div>
        </Card>
        <Card>
          <div className="section-top">
            <div>
              <p className="eyebrow">YOUR TOOLKIT</p>
              <h3>Make your next move</h3>
            </div>
            <ArrowUpRight size={20} className="muted" />
          </div>
          {[
            {
              id: "bmi",
              title: "Know your starting point",
              text: "Calculate and track your BMI",
              Icon: Scale,
            },
            {
              id: "food",
              title: "Fuel your progress",
              text: "Keep your nutrition in view",
              Icon: Utensils,
            },
            {
              id: "plans",
              title: "Find your direction",
              text: "Build a plan around your goals",
              Icon: Sparkles,
            },
          ].map(({ id, title, text, Icon }) => (
            <button className="tool-row" key={id} onClick={() => go(id)}>
              <span className={`icon-box ${id}`}>
                <Icon size={21} />
              </span>
              <span>
                <strong>{title}</strong>
                <small>{text}</small>
              </span>
              <ArrowUpRight size={17} />
            </button>
          ))}
        </Card>
      </div>
      <div className="dashboard-grid">
        <Card>
          <div className="section-top">
            <h3>Recent activity</h3>
            <TextLink onClick={() => go("workout")}>Open trackers</TextLink>
          </div>
          {recent.length ? (
            recent.map((row) => (
              <div className="activity-row" key={row.id}>
                <span className="icon-box">
                  {row.kind === "food" ? (
                    <Utensils size={18} />
                  ) : (
                    <Dumbbell size={18} />
                  )}
                </span>
                <div>
                  <strong>{row.title}</strong>
                  <small>
                    {row.time} · {row.detail}
                  </small>
                </div>
              </div>
            ))
          ) : (
            <Empty
              title="A fresh start looks good on you."
              text="Log your first workout or meal. Your activity will appear here."
            />
          )}
        </Card>
        <Card className="program-promo">
          <p className="eyebrow">A LITTLE STRUCTURE GOES A LONG WAY</p>
          <h3>Find your training rhythm.</h3>
          <p className="muted">
            Explore the original FirstRep programs, from full-body basics to a
            dedicated push / pull / legs split.
          </p>
          <div className="program-chips">
            {content.programs.slice(0, 3).map((p) => (
              <span className="chip" key={p.id}>
                {p.schedule.length} days ·{" "}
                {p.title === "Low Volume Strength" ? "Full body" : p.title}
              </span>
            ))}
          </div>
          <TextLink onClick={() => go("programs")}>
            Explore all 5 programs
          </TextLink>
        </Card>
      </div>
    </>
  );
}
