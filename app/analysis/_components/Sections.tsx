import { Activity } from "lucide-react";
import Link from "next/link";
import type { Metrics, Insight } from "@/lib/analysis/types";
import { localDate } from "@/lib/analysis/metrics";
export function EmptyState({ guest = false }: { guest?: boolean }) {
  return (
    <section className="analysis-card analysis-empty">
      <Activity size={52} aria-hidden="true" />
      <h2>Your next chapter starts with one workout.</h2>
      <p>Log your first workout and this page fills in.</p>
      {guest && (
        <p className="analysis-muted">
          Sign in from the dashboard to analyze your saved account history.
          Guest logs stay in your browser session.
        </p>
      )}
      <Link className="btn primary" href="/#exercises">
        Explore the exercise library
      </Link>
      {guest && (
        <Link className="btn" href="/">
          Go to dashboard to sign in
        </Link>
      )}
    </section>
  );
}
export function ConsistencyHeatmap({
  metrics: m,
  timezone,
}: {
  metrics: Metrics;
  timezone: string;
}) {
  const end = new Date(
    localDate(new Date().toISOString(), timezone) + "T12:00:00Z",
  );
  const max = Math.max(1, ...m.days.map((d) => d.volume));
  return (
    <section className="analysis-card">
      <h2>Your training calendar</h2>
      <p className="analysis-muted">
        Last 12 weeks · activity within the selected range · darker cells mean
        less volume
      </p>
      <div
        className="analysis-heatmap"
        role="list"
        aria-label="Daily training activity"
      >
        {Array.from({ length: 84 }, (_, i) => {
          const date = new Date(end);
          date.setUTCDate(date.getUTCDate() - 83 + i);
          const key = date.toISOString().slice(0, 10),
            entry = m.days.find((d) => d.date === key);
          const description = entry
            ? `${key}: ${entry.sessions} sessions; ${entry.names.join(", ")}`
            : `${key}: no recorded activity in this range`;
          return (
            <span
              key={key}
              role="listitem"
              tabIndex={0}
              title={description}
              aria-label={description}
              style={{
                background: entry
                  ? `color-mix(in srgb, var(--accent) ${25 + (75 * entry.volume) / max}%, var(--surface))`
                  : "var(--surface-raised)",
              }}
            />
          );
        })}
      </div>
      <p className="analysis-muted">
        {m.avgGap === null
          ? "More sessions will reveal your rest-day distribution."
          : `Average gap ${m.avgGap.toFixed(1)} days · longest gap ${m.longestGap} days`}{" "}
        · Rolling frequency {m.frequency.toFixed(1)} sessions/week
      </p>
    </section>
  );
}
export function InsightCards({ insights }: { insights: Insight[] }) {
  return (
    <section>
      <h2>Areas for improvement</h2>
      <div className="analysis-insights">
        {insights.map((i) => (
          <article className="analysis-card" key={i.id}>
            <span className="analysis-eyebrow">
              {i.severity} · {i.metric}
            </span>
            <h3>{i.title}</h3>
            <p className="analysis-muted">{i.body}</p>
            {i.action && (
              <Link className="analysis-link" href={i.action.href}>
                {i.action.label} →
              </Link>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
export function LibraryUsage({ metrics: m }: { metrics: Metrics }) {
  return (
    <section className="analysis-card">
      <h2>Your library</h2>
      <p className="analysis-muted">
        Favorite exercise usage in this range. Saved workout use requires a
        linked session.
      </p>
      {m.library.length === 0 ? (
        <p>
          Your favorites and saved workouts will appear here.{" "}
          <Link className="analysis-link" href="/#exercises">
            Explore the library →
          </Link>
        </p>
      ) : (
        <ul className="analysis-library">
          {[...m.library]
            .sort((a, b) => b.count - a.count)
            .map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  href={
                    item.kind === "exercise"
                      ? `/?exercise=${encodeURIComponent(item.id)}#exercises`
                      : `/?workout=${encodeURIComponent(item.id)}#saved`
                  }
                >
                  {item.name} →
                </Link>
                <span className="analysis-muted">
                  {item.count} sessions in range
                  {item.unused
                    ? " · no linked activity"
                    : item.daysSince !== null && item.daysSince >= 30
                      ? ` · last trained ${item.daysSince} days ago`
                      : ""}
                </span>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
