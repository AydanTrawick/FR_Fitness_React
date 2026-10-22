import type { Metrics } from "@/lib/analysis/types";
export default function SnapshotCards({
  metrics: m,
  unit,
}: {
  metrics: Metrics;
  unit: "kg" | "lb";
}) {
  const factor = unit === "lb" ? 1 / 0.45359237 : 1;
  const number = (value: number | null) =>
    value === null
      ? "—"
      : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  const duration = m.snapshot.duration;
  const prior = m.previous?.duration;
  const delta =
    duration !== null && prior != null && prior > 0
      ? ((duration - prior) / prior) * 100
      : null;
  const cards = [
    {
      label: "Most common exercise",
      value: m.mostCommonExercise?.name ?? "—",
      suffix: "",
      detail: m.mostCommonExercise
        ? `Logged in ${m.mostCommonExercise.sessions} ${m.mostCommonExercise.sessions === 1 ? "session" : "sessions"} in this range`
        : "Log a working set to get started",
    },
    {
      label: "Weekly volume average",
      value: number(
        m.weeklyVolumeAverage === null ? null : m.weeklyVolumeAverage * factor,
      ),
      suffix: `${unit}/week`,
      detail: "Working-set volume ÷ weeks in this range",
    },
    {
      label: "Avg duration",
      value: number(duration),
      suffix: duration === null ? "" : "min",
      detail:
        delta === null
          ? "No comparable prior data"
          : `${delta >= 0 ? "↑" : "↓"} ${Math.abs(delta).toFixed(1)}% vs. prior period`,
    },
    {
      label: "Average rep/set ratio",
      value: number(m.averageRepsPerSet),
      suffix: m.averageRepsPerSet === null ? "" : "reps/set",
      detail: "Total working reps ÷ working sets",
    },
  ];
  return (
    <div className="analysis-snapshot">
      {cards.map((card) => (
        <section className="analysis-card" key={card.label}>
          <p className="analysis-muted">{card.label}</p>
          <p className="analysis-number" style={{ overflowWrap: "anywhere" }}>
            {card.value}
            <small> {card.suffix}</small>
          </p>
          <span className="analysis-muted">{card.detail}</span>
        </section>
      ))}
    </div>
  );
}
