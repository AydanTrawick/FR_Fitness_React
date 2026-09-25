import type {
  RawData,
  Session,
  Snapshot,
  Range,
  Metrics,
  Pattern,
} from "./types.ts";
export const patterns: Pattern[] = [
  "push",
  "pull",
  "hinge",
  "squat",
  "carry",
  "core",
];
export function parseRange(value: unknown): Range {
  return value === "7d" || value === "90d" || value === "all" ? value : "30d";
}
const formatters = new Map<string, Intl.DateTimeFormat>();
export function localDate(value: string, timezone: string) {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    if (formatters.size > 100) formatters.clear();
    formatters.set(timezone, formatter);
  }
  return formatter.format(new Date(value));
}
const day = (value: string) =>
  Date.parse(value.slice(0, 10) + "T12:00:00Z") / 86400000;
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const a = [...values].sort((a, b) => a - b);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
export function slope(points: { x: number; y: number }[]): number | null {
  if (points.length < 2) return null;
  const x = points.reduce((s, p) => s + p.x, 0) / points.length,
    y = points.reduce((s, p) => s + p.y, 0) / points.length;
  const denominator = points.reduce((s, p) => s + (p.x - x) ** 2, 0);
  return denominator
    ? points.reduce((s, p) => s + (p.x - x) * (p.y - y), 0) / denominator
    : null;
}
export function sessionVolume(session: Session): number | null {
  const sets = session.sets.filter(
    (s) => !s.warmup && s.reps !== null && s.weight !== null,
  );
  return sets.length
    ? sets.reduce((n, s) => n + s.reps! * s.weight! * s.count, 0)
    : null;
}
const duration = (s: Session) =>
  !s.legacy &&
  s.completedAt &&
  Date.parse(s.completedAt) >= Date.parse(s.startedAt)
    ? (Date.parse(s.completedAt) - Date.parse(s.startedAt)) / 60000
    : null;
export function computeMetrics(
  raw: RawData,
  range: Range,
  timezone: string,
  now = new Date(),
): Metrics {
  const today = day(localDate(now.toISOString(), timezone));
  const date = (s: Session) => s.dateOnly ?? localDate(s.startedAt, timezone);
  const age = (s: Session) => today - day(date(s));
  const completed = raw.sessions
    .filter((s) => s.completedAt !== null && age(s) >= 0)
    .sort(
      (a, b) =>
        date(a).localeCompare(date(b)) ||
        a.startedAt.localeCompare(b.startedAt),
    );
  const n = range === "all" ? Infinity : Number(range.slice(0, -1));
  const selected = completed.filter((s) => age(s) < n);
  const snapshot = (rows: Session[], from: number, to: number): Snapshot => {
    const volumes = rows
      .map(sessionVolume)
      .filter((v): v is number => v !== null);
    const scheduled = raw.schedule.filter((s) => {
      const a = today - day(localDate(s.date, timezone));
      return a >= from && a < to;
    });
    const completeIds = new Set(completed.map((s) => s.id));
    const span = scheduled.length
      ? today -
        Math.min(...scheduled.map((s) => day(localDate(s.date, timezone))))
      : 0;
    return {
      sessions: rows.length,
      volume: volumes.length ? volumes.reduce((a, b) => a + b, 0) : null,
      duration: median(
        rows.map(duration).filter((v): v is number => v !== null),
      ),
      consistency:
        scheduled.length && span >= 6
          ? (scheduled.filter(
              (s) => s.sessionId && completeIds.has(s.sessionId),
            ).length /
              scheduled.length) *
            100
          : null,
    };
  };
  const weekly = new Map<string, Session[]>(),
    days = new Map<string, Session[]>();
  const muscles = new Map<string, number>(),
    patternVolume = new Map<Pattern, number>(),
    exercise = new Map<
      string,
      { name: string; rows: { date: string; value: number }[]; count: number }
    >();
  const variety = new Set<string>();
  for (const s of selected) {
    const d = date(s),
      stamp = new Date(d + "T12:00:00Z");
    stamp.setUTCDate(stamp.getUTCDate() - ((stamp.getUTCDay() + 6) % 7));
    const week = stamp.toISOString().slice(0, 10);
    weekly.set(week, [...(weekly.get(week) ?? []), s]);
    days.set(d, [...(days.get(d) ?? []), s]);
    const best = new Map<string, number>();
    for (const set of s.sets) {
      if (set.warmup) continue;
      variety.add(set.exerciseId);
      const e = exercise.get(set.exerciseId) ?? {
        name: set.name,
        rows: [],
        count: 0,
      };
      exercise.set(set.exerciseId, e);
      if (set.weight === null || set.reps === null) continue;
      const v = set.weight * set.reps * set.count;
      if (set.primary)
        muscles.set(set.primary, (muscles.get(set.primary) ?? 0) + v);
      for (const secondary of set.secondary)
        muscles.set(secondary, (muscles.get(secondary) ?? 0) + v * 0.5);
      if (set.pattern)
        patternVolume.set(
          set.pattern,
          (patternVolume.get(set.pattern) ?? 0) + v,
        );
      if (set.weight > 0 && set.reps > 0)
        best.set(
          set.exerciseId,
          Math.max(
            best.get(set.exerciseId) ?? 0,
            set.weight * (1 + set.reps / 30),
          ),
        );
    }
    for (const id of new Set(
      s.sets.filter((s) => !s.warmup).map((s) => s.exerciseId),
    ))
      exercise.get(id)!.count++;
    for (const [id, value] of best)
      exercise.get(id)!.rows.push({ date: d, value });
  }
  const muscleTotal = [...muscles.values()].reduce((a, b) => a + b, 0),
    patternTotal = [...patternVolume.values()].reduce((a, b) => a + b, 0);
  const strength = [...exercise]
    .map(([id, e]) => {
      const points = e.rows;
      const recent = points.filter((p) => today - day(p.date) < 60);
      const trendSlope = slope(
        recent.map((p) => ({ x: day(p.date), y: p.value })),
      );
      const change =
        recent.length >= 3 && trendSlope !== null
          ? ((trendSlope * (day(recent.at(-1)!.date) - day(recent[0].date))) /
              recent[0].value) *
            100
          : null;
      return {
        id,
        name: e.name,
        count: e.count,
        points,
        current: points.at(-1)?.value ?? null,
        change,
        trend:
          change === null
            ? null
            : change >= 2
              ? ("Trending up" as const)
              : change <= -2
                ? ("Down recently" as const)
                : ("Holding steady" as const),
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const gaps = selected
    .slice(1)
    .map((s, i) => day(date(s)) - day(date(selected[i])));
  const bodyRows = raw.body
    .map((b) => ({ ...b, date: localDate(b.date, timezone) }))
    .filter(
      (b) => today - day(b.date) >= 0 && today - day(b.date) < Math.min(n, 90),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const body = bodyRows.map((b) => {
    const window = bodyRows.filter(
      (r) => day(b.date) - day(r.date) >= 0 && day(b.date) - day(r.date) < 7,
    );
    return {
      ...b,
      average: window.reduce((s, r) => s + r.weight, 0) / window.length,
    };
  });
  const library = raw.library.map((item) => {
    const used = completed.filter((s) =>
      item.kind === "workout"
        ? s.planId === item.id
        : s.sets.some((set) => set.exerciseId === item.id && !set.warmup),
    );
    return {
      ...item,
      count: selected.filter((s) => used.includes(s)).length,
      daysSince: used.length ? age(used.at(-1)!) : null,
      unused: item.kind === "workout" ? !raw.sessions.some(s => s.planId === item.id) : used.length === 0,
    };
  });
  return {
    snapshot: snapshot(selected, 0, n),
    previous: Number.isFinite(n)
      ? snapshot(
          completed.filter((s) => age(s) >= n && age(s) < n * 2),
          n,
          n * 2,
        )
      : null,
    totalSessions: completed.length,
    legacy: selected.some((s) => s.legacy),
    weekly: [...weekly].map(([date, rows]) => ({
      date,
      sessions: rows.length,
      volume: rows.some(s => sessionVolume(s) !== null) ? rows.reduce((sum, s) => sum + (sessionVolume(s) ?? 0), 0) : null,
      duration: median(
        rows.map(duration).filter((v): v is number => v !== null),
      ),
    })),
    muscles: [...muscles]
      .map(([name, v]) => ({
        name,
        value: muscleTotal ? (v / muscleTotal) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value),
    patterns: patterns.map((name) => ({
      name,
      value: patternTotal
        ? ((patternVolume.get(name) ?? 0) / patternTotal) * 100
        : 0,
    })),
    strength,
    days: [...days].map(([date, rows]) => ({
      date,
      volume: rows.reduce((sum, s) => sum + (sessionVolume(s) ?? 0), 0),
      sessions: rows.length,
      names: [...new Set(rows.flatMap((s) => s.sets.map((s) => s.name)))],
    })),
    variety: variety.size,
    frequency: completed.filter((s) => age(s) < 28).length / 4,
    previousFrequency:
      completed.filter((s) => age(s) >= 28 && age(s) < 56).length / 4,
    avgGap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
    longestGap: gaps.length ? Math.max(...gaps) : null,
    body,
    bodySlope:
      body.length >= 4
        ? slope(body.map((b) => ({ x: day(b.date), y: b.weight })))
        : null,
    library,
  };
}
