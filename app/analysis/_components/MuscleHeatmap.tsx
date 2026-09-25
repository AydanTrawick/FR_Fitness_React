"use client";

import { useEffect, useMemo, useState } from "react";
import Model, {
  anteriorData,
  posteriorData,
  type IBodyPart,
  type Muscle,
} from "@plexapro/react-body-highlighter";
import { colorBucket, toSlugTotals, type MuscleTotals } from "@/lib/muscle-heatmap";

type Range = "7d" | "30d";
type Payload = { range: Range; muscles: MuscleTotals };
const colors = ["#48514b", "#c9e5a6", "#8fbd58", "#4f8b34"];
const supported = {
  anterior: new Set(anteriorData.map((part) => part.muscle)),
  posterior: new Set(posteriorData.map((part) => part.muscle)),
};
function baseSlug(slug: string) {
  return slug.replace(/^(left|right)-/, "");
}

export default function MuscleHeatmap() {
  const [range, setRange] = useState<Range>("7d");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/analysis/muscles?range=${range}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load the muscle map.");
        return data as Payload;
      })
      .then((data) => { setPayload(data); setLoading(false); })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Could not load the muscle map.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [range]);

  const slugTotals = useMemo(() => toSlugTotals(payload?.muscles ?? {}), [payload]);

  const modelData = (view: "anterior" | "posterior"): IBodyPart[] =>
    Object.entries(slugTotals).flatMap(([slug, total]) =>
      [slug, `left-${slug}`, `right-${slug}`]
        .filter((part) => supported[view].has(part as Muscle))
        .map((part) => ({
          name: part,
          type: view,
          muscles: [part as Muscle],
          color: colors[colorBucket(total.sets, range)],
        })),
    );
  const details = selected ? slugTotals[selected] : null;
  const empty = !Object.keys(slugTotals).length;

  return (
    <section className="analysis-card muscle-heatmap" aria-label="Muscle heatmap">
      <div className="analysis-heading">
        <div>
          <h2>Muscle map</h2>
          <p className="analysis-muted">Working sets by muscle · primary 1, secondary 0.5</p>
        </div>
        <div className="analysis-segments" role="group" aria-label="Muscle map date range">
          {(["7d", "30d"] as Range[]).map((value) => (
            <button key={value} aria-pressed={range === value} onClick={() => { setLoading(true); setError(""); setRange(value); setSelected(null); }}>{value}</button>
          ))}
        </div>
      </div>
      {loading && <p role="status" className="analysis-muted">Loading muscle map…</p>}
      {error && <p role="alert" className="notice error">{error}</p>}
      {!loading && !error && (
        <>
          <div className="muscle-views">
            {(["anterior", "posterior"] as const).map((view) => (
              <div className="muscle-view" key={view}>
                <h3>{view === "anterior" ? "Front" : "Back"}</h3>
                <Model
                  type={view}
                  data={modelData(view)}
                  bodyColor={colors[0]}
                  borderColor="#273029"
                  style={{ width: "100%", maxWidth: 290 }}
                  onClick={({ muscle }) => setSelected(slugTotals[baseSlug(muscle)] ? baseSlug(muscle) : null)}
                />
              </div>
            ))}
          </div>
          {empty && <p className="analysis-muted muscle-empty">Log a workout to see your muscle map.</p>}
          <div className="muscle-legend" aria-label="Weekly set color legend">
            {[
              ["0", 0], ["1–9", 1], ["10–19", 2], ["20+", 3],
            ].map(([label, bucket]) => (
              <span key={label}><i style={{ background: colors[Number(bucket)] }} />{label} weekly sets</span>
            ))}
          </div>
          {details && (
            <aside className="muscle-detail" aria-live="polite">
              <button className="btn secondary small" onClick={() => setSelected(null)} aria-label="Close muscle details">Close</button>
              <h3>{details.muscles.map((name) => name.replace(/^./, (letter) => letter.toUpperCase())).join(" + ")}</h3>
              <p><strong>{details.sets}</strong> credited sets in {range}</p>
              <h4>Exercises</h4>
              <ul>{details.exercises.map((exercise) => <li key={exercise}>{exercise}</li>)}</ul>
            </aside>
          )}
        </>
      )}
    </section>
  );
}
