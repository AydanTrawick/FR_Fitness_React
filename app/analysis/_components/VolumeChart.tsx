"use client";
import { useState, Component, type ReactNode } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
} from "recharts";
import type { Metrics } from "@/lib/analysis/types";
export class ChartBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="status">
        This chart is unavailable. Please reload to try again.
      </p>
    ) : (
      this.props.children
    );
  }
}
export function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number | null)[][];
}) {
  return (
    <table className="analysis-sr">
      <caption>Chart data</caption>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j}>{c ?? "Not recorded"}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
export default function VolumeChart({
  metrics: m,
  unit,
}: {
  metrics: Metrics;
  unit: "kg" | "lb";
}) {
  const [metric, setMetric] = useState<"volume" | "sessions" | "duration">(
    "volume",
  );
  const factor = unit === "lb" ? 1 / 0.45359237 : 1;
  const data = m.weekly.map((p) => ({
    ...p,
    volume: p.volume === null ? null : Math.round(p.volume * factor),
  }));
  return (
    <section className="analysis-card">
      <div className="analysis-heading">
        <div>
          <h2>Progress over time</h2>
          <p className="analysis-muted">
            Weekly totals ·{" "}
            {metric === "volume"
              ? `${unit} lifted`
              : metric === "duration"
                ? "median minutes"
                : "completed sessions"}
          </p>
        </div>
        <div
          className="analysis-segments"
          role="group"
          aria-label="Chart metric"
        >
          {(["volume", "sessions", "duration"] as const).map((v) => (
            <button
              key={v}
              aria-pressed={metric === v}
              onClick={() => setMetric(v)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <ChartBoundary>
        <div className="analysis-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 10, right: 4, bottom: 5, left: 0 }}
              accessibilityLayer
            >
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                tickFormatter={(s) => s.slice(5)}
              />
              <YAxis width={48} tick={{ fill: "var(--muted)", fontSize: 11 }} />
              <YAxis
                yAxisId="sessions"
                orientation="right"
                allowDecimals={false}
                hide
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  color: "var(--foreground)",
                }}
              />
              <Area
                type="linear"
                dataKey={metric}
                stroke="var(--accent)"
                fill="var(--accent)"
                fillOpacity={0.12}
                connectNulls={false}
              />
              {metric === "volume" && (
                <Line
                  yAxisId="sessions"
                  dataKey="sessions"
                  stroke="var(--muted)"
                  dot={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartBoundary>
      <DataTable
        headers={["Week", `Volume (${unit})`, "Sessions", "Median minutes"]}
        rows={data.map((p) => [p.date, p.volume, p.sessions, p.duration])}
      />
    </section>
  );
}
export function PatternRadar({ metrics: m }: { metrics: Metrics }) {
  const data = m.patterns.map((p) => ({ ...p, reference: 100 / 6 }));
  return (
    <section className="analysis-card">
      <h2>Movement pattern balance</h2>
      <p className="analysis-muted">
        Share of classified volume · reference is equal distribution, not a
        target
      </p>
      {!data.some((p) => p.value > 0) ? (
        <p>No weighted sets with movement patterns in this range.</p>
      ) : (
        <>
          <div className="analysis-radar">
            <ChartBoundary>
              <ResponsiveContainer width="100%" height={250}>
                <RadarChart data={data} accessibilityLayer>
                  <PolarGrid stroke="var(--line)" />
                  <PolarAngleAxis
                    dataKey="name"
                    tick={{ fill: "var(--foreground)", fontSize: 12 }}
                  />
                  <Radar
                    dataKey="reference"
                    stroke="var(--muted)"
                    fill="var(--muted)"
                    fillOpacity={0.06}
                  />
                  <Radar
                    dataKey="value"
                    stroke="var(--accent)"
                    fill="var(--accent)"
                    fillOpacity={0.2}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </ChartBoundary>
          </div>
          <div className="analysis-mobile-patterns">
            <Bars rows={data} />
          </div>
        </>
      )}
      <DataTable
        headers={["Pattern", "Percent", "Equal reference"]}
        rows={data.map((p) => [p.name, p.value, p.reference])}
      />
    </section>
  );
}
export function Bars({ rows }: { rows: { name: string; value: number }[] }) {
  return (
    <div className="analysis-bars">
      {rows.map((p) => (
        <div key={p.name}>
          <div className="analysis-heading">
            <span>{p.name}</span>
            <span>{p.value.toFixed(1)}%</span>
          </div>
          <div className="analysis-track">
            <div style={{ width: `${p.value}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
export function StrengthTrends({
  metrics: m,
  unit,
}: {
  metrics: Metrics;
  unit: "kg" | "lb";
}) {
  const factor = unit === "lb" ? 1 / 0.45359237 : 1;
  return (
    <section className="analysis-card">
      <h2>Strength trends</h2>
      <p className="analysis-muted">
        Estimated 1RM · Epley formula · top six exercises by session count
      </p>
      {m.strength.length === 0 && (
        <p>Log weighted working sets to see estimates.</p>
      )}
      {m.strength.map((e) => {
        const data = e.points.map((p) => ({
          ...p,
          value: Number((p.value * factor).toFixed(1)),
        }));
        return (
          <details className="analysis-strength" key={e.id}>
            <summary>
              <span>
                {e.name}
                <small>
                  {e.trend ??
                    `Needs ${Math.max(0, 3 - e.points.length)} more sessions for a trend`}
                </small>
              </span>
              <strong>
                {e.current === null ? "—" : (e.current * factor).toFixed(1)}{" "}
                {unit}
              </strong>
              <span aria-hidden="true" className="analysis-spark">
                <ResponsiveContainer width="100%" height={42}>
                  <ComposedChart data={data} accessibilityLayer={false}>
                    <Line dataKey="value" stroke="var(--accent)" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </span>
            </summary>
            <ChartBoundary>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={data} accessibilityLayer>
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "var(--muted)", fontSize: 11 }}
                  />
                  <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "var(--surface)" }} />
                  <Line dataKey="value" stroke="var(--accent)" />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartBoundary>
            <DataTable
              headers={["Date", `Estimated 1RM (${unit})`]}
              rows={data.map((p) => [p.date, p.value])}
            />
          </details>
        );
      })}
    </section>
  );
}
export function BodyTrend({
  metrics: m,
  unit,
}: {
  metrics: Metrics;
  unit: "kg" | "lb";
}) {
  const factor = unit === "lb" ? 1 / 0.45359237 : 1;
  const data = m.body.map((p) => ({
    ...p,
    weight: p.weight * factor,
    average: p.average * factor,
  }));
  return (
    <section className="analysis-card">
      <h2>Bodyweight trend</h2>
      <p className="analysis-muted">
        7-day average of recorded readings · {unit} · no filled gaps
      </p>
      {!data.length ? (
        <p>No bodyweight readings in this range.</p>
      ) : (
        <>
          <ChartBoundary>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={data} accessibilityLayer>
                <XAxis
                  dataKey="date"
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                />
                <Tooltip contentStyle={{ background: "var(--surface)" }} />
                <Line dataKey="average" stroke="var(--accent)" />
                <Line
                  dataKey="weight"
                  stroke="var(--muted)"
                  strokeWidth={0}
                  dot
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartBoundary>
          <p>
            {m.bodySlope === null
              ? `Needs ${Math.max(0, 4 - data.length)} more readings to describe a slope.`
              : `Observed slope: ${(m.bodySlope * factor * 7).toFixed(2)} ${unit} per week.`}
          </p>
          <DataTable
            headers={["Date", `Weight (${unit})`, "7-day average"]}
            rows={data.map((p) => [p.date, p.weight, p.average])}
          />
        </>
      )}
    </section>
  );
}
