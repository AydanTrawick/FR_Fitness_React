import { currentUser } from "@/lib/server";
import Link from "next/link";
import { getAnalysisData } from "@/lib/analysis/queries";
import { analysisOptions } from "@/lib/analysis/options";
import RangeSelector from "./_components/RangeSelector";
import MuscleHeatmap from "./_components/MuscleHeatmap";
import SnapshotCards from "./_components/SnapshotCards";
import VolumeChart, {
  Bars,
  PatternRadar,
  StrengthTrends,
  BodyTrend,
  ChartBoundary,
} from "./_components/VolumeChart";
import {
  EmptyState,
  ConsistencyHeatmap,
  InsightCards,
  LibraryUsage,
} from "./_components/Sections";
import "./analysis.css";
import "./muscle-heatmap.css";
export const metadata = { title: "Your Analysis — FirstRep" };
const disclaimer =
  "These insights are generated from your logged activity and are for general fitness tracking only. They are not medical or nutritional advice. Talk to a qualified professional before making significant changes to your training or diet.";
export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const options = analysisOptions(await searchParams);
  const user = await currentUser();
  const data = user
    ? await getAnalysisData(
        user.id,
        options.range,
        options.timezone,
        options.unit,
      )
    : null;
  const m = data?.metrics;
  return (
    <main className="analysis-page">
      <Link className="analysis-link" href="/">
        ← FirstRep dashboard
      </Link>
      <header className="analysis-header">
        <div>
          <span className="analysis-eyebrow">
            YOUR TRAINING, IN PERSPECTIVE
          </span>
          <h1>Your Analysis</h1>
          <p className="analysis-muted">
            A clearer view of the work you’re putting in.
          </p>
        </div>
        <RangeSelector range={options.range} unit={options.unit} />
      </header>
      {!data ? (
        <EmptyState guest />
      ) : (
        <>
          <MuscleHeatmap />
          {data.errors.includes("activity") ? (
            <section className="analysis-card" role="status">
              <h2>Training history is temporarily unavailable</h2>
              <p>
                Please retry shortly. Your other data is still available below.
              </p>
            </section>
          ) : m!.totalSessions === 0 ? (
            <EmptyState />
          ) : (
            <>
              <SnapshotCards metrics={m!} unit={options.unit} />
              {m!.legacy && (
                <p className="analysis-muted">
                  Earlier logs are grouped by training day. Their session
                  duration, warmup status and saved-workout links were not
                  recorded; no estimates are added for those fields.
                </p>
              )}
              {m!.snapshot.sessions <= 3 ? (
                <section className="analysis-card">
                  <h2>Every session adds perspective.</h2>
                  <p>
                    {4 - m!.snapshot.sessions} more{" "}
                    {4 - m!.snapshot.sessions === 1
                      ? "session unlocks"
                      : "sessions unlock"}{" "}
                    trend charts in this range.
                  </p>
                </section>
              ) : (
                <>
                  <VolumeChart metrics={m!} unit={options.unit} />
                  <div className="analysis-grid">
                    <section className="analysis-card">
                      <h2>Muscle balance</h2>
                      <p className="analysis-muted">
                        Share of attributed volume · primary 100%, secondary 50%
                      </p>
                      {m!.muscles.length ? (
                        <Bars rows={m!.muscles} />
                      ) : (
                        <p>No weighted working sets in this range.</p>
                      )}
                    </section>
                    <PatternRadar metrics={m!} />
                  </div>
                  <ChartBoundary>
                    <StrengthTrends metrics={m!} unit={options.unit} />
                  </ChartBoundary>
                  <ConsistencyHeatmap
                    metrics={m!}
                    timezone={options.timezone}
                  />
                  <InsightCards insights={data.insights} />
                </>
              )}
            </>
          )}
          {(data.errors.includes("activity") || m!.snapshot.sessions > 3) && (
            <>
              {data.errors.includes("body") ? (
                <section className="analysis-card">
                  Bodyweight readings are temporarily unavailable.
                </section>
              ) : (
                <BodyTrend metrics={m!} unit={options.unit} />
              )}
              {data.errors.includes("library") ? (
                <section className="analysis-card">
                  Your library is temporarily unavailable.
                </section>
              ) : (
                <LibraryUsage metrics={m!} />
              )}
            </>
          )}
        </>
      )}
      <footer className="analysis-footer">
        <p>{disclaimer}</p>
        <p>
          Dates shown in {options.timezone}. Missing measurements stay missing.
        </p>
      </footer>
    </main>
  );
}
