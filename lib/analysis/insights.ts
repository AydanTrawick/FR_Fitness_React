import type { Metrics, Insight } from "./types.ts";
export function getInsights(m: Metrics, now = new Date()): Insight[] {
  if (m.snapshot.sessions < 3) return [];
  const result: Insight[] = [];
  const add = (
    id: string,
    title: string,
    body: string,
    metric: string,
    href?: string,
    label = "Explore exercises",
    severity: Insight["severity"] = "suggestion",
  ) =>
    result.push({
      id,
      title,
      body,
      metric,
      severity,
      ...(href ? { action: { label, href } } : {}),
    });
  const high = m.patterns.find((p) => p.value > 35),
    low = m.patterns.find((p) => p.value < 8);
  if (high && low)
    add(
      "pattern",
      `Make room for ${low.name}`,
      `${low.name} accounts for ${low.value.toFixed(1)}% of classified volume; ${high.name} accounts for ${high.value.toFixed(1)}%. Consider including a ${low.name} movement.`,
      `${low.value.toFixed(1)}% / ${high.value.toFixed(1)}%`,
      `/?pattern=${low.name}#exercises`,
    );
  for (const e of m.strength) {
    if (
      e.change !== null &&
      Math.abs(e.change) < 2 &&
      e.points.length >= 3 &&
      Date.parse(e.points.at(-1)!.date) - Date.parse(e.points[0].date) >=
        42 * 86400000
    ) {
      add(
        "plateau",
        `${e.name}: holding steady`,
        `Estimated strength changed ${e.change.toFixed(1)}% over at least 6 weeks. Try a different rep range or an extra set if it fits your plan.`,
        `${e.change.toFixed(1)}%`,
      );
      break;
    }
  }
  if (m.previousFrequency > 0 && m.frequency <= m.previousFrequency * 0.7)
    add(
      "frequency",
      "A change in training frequency",
      `Your last four weeks averaged ${m.frequency.toFixed(1)} sessions per week, compared with ${m.previousFrequency.toFixed(1)} previously. Adjust your plan to fit your current schedule.`,
      `${m.frequency.toFixed(1)} vs ${m.previousFrequency.toFixed(1)} / week`,
      "/#builder",
      "Review your plan",
    );
  if (m.avgGap !== null && m.avgGap > 5)
    add(
      "gaps",
      "Try shorter, more frequent sessions",
      `There are ${m.avgGap.toFixed(1)} days on average between recorded sessions. Shorter sessions may fit more comfortably.`,
      `${m.avgGap.toFixed(1)} days`,
      "/#builder",
      "Build a workout",
    );
  if (m.variety > 0 && m.variety < 6)
    add(
      "variety",
      "Explore a little variety",
      `You used ${m.variety} distinct exercises in this range. Browse movements for the muscles you already train.`,
      `${m.variety} exercises`,
      "/#exercises",
    );
  const unused = m.library.find(
    (l) =>
      l.kind === "workout" &&
      l.unused &&
      l.savedAt &&
      now.getTime() - Date.parse(l.savedAt) >= 14 * 86400000,
  );
  if (unused)
    add(
      "saves",
      "A saved workout to revisit",
      `${unused.name} has been saved for ${Math.floor((now.getTime() - Date.parse(unused.savedAt!)) / 86400000)} days with no linked session. Open it when you're ready.`,
      `${Math.floor((now.getTime() - Date.parse(unused.savedAt!)) / 86400000)} days`,
      "/#saved",
      "View saved workouts",
      "info",
    );
  if (
    m.snapshot.duration &&
    m.previous?.duration &&
    m.snapshot.duration >= m.previous.duration * 1.4 &&
    m.snapshot.volume !== null &&
    m.previous.volume &&
    Math.abs(m.snapshot.volume / m.previous.volume - 1) < 0.05
  )
    add(
      "duration",
      "Sessions are getting longer",
      `Median duration is ${m.snapshot.duration.toFixed(0)} minutes, up from ${m.previous.duration.toFixed(0)}, with volume changing less than 5%. Rest periods may be stretching.`,
      `${m.snapshot.duration.toFixed(0)} vs ${m.previous.duration.toFixed(0)} min`,
      undefined,
      undefined,
      "info",
    );
  if (!result.length)
    add(
      "clear",
      "Keep building your history",
      `You recorded ${m.snapshot.sessions} sessions and ${m.variety} exercises in this range. Keep logging to make your trends clearer.`,
      `${m.snapshot.sessions} sessions`,
      undefined,
      undefined,
      "info",
    );
  return result
    .sort(
      (a, b) =>
        (a.severity === "suggestion" ? 0 : 1) -
        (b.severity === "suggestion" ? 0 : 1),
    )
    .slice(0, 3);
}
