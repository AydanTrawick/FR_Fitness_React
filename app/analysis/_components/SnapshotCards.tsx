import type { Metrics } from "@/lib/analysis/types";
export default function SnapshotCards({
  metrics: m,
  unit,
}: {
  metrics: Metrics;
  unit: "kg" | "lb";
}) {
  const factor = unit === "lb" ? 1 / 0.45359237 : 1;
  return (
    <div className="analysis-snapshot">
      {(
        [
          ["sessions", m.legacy ? "Training days / sessions" : "Sessions", ""],
          ["volume", "Total volume", unit],
          ["duration", "Avg duration (median)", "min"],
          ["consistency", "Consistency", "%"],
        ] as const
      ).map(([key, label, suffix]) => {
        const value = m.snapshot[key],
          prior = m.previous?.[key];
        const delta =
          value !== null && prior != null && prior !== 0
            ? ((value - prior) / prior) * 100
            : null;
        return (
          <section className="analysis-card" key={key}>
            <p className="analysis-muted">{label}</p>
            <p className="analysis-number">
              {value === null
                ? "—"
                : (key === "volume" ? value * factor : value).toLocaleString(
                    undefined,
                    { maximumFractionDigits: key === "sessions" ? 0 : 1 },
                  )}
              <small> {value !== null ? suffix : ""}</small>
            </p>
            <span
              className={
                delta !== null && Math.abs(delta) >= 5
                  ? "analysis-delta"
                  : "analysis-muted"
              }
            >
              {delta === null
                ? "No comparable prior data"
                : `${delta >= 0 ? "↑" : "↓"} ${Math.abs(delta).toFixed(1)}% vs. prior period`}
            </span>
          </section>
        );
      })}
    </div>
  );
}
