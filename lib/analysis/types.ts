export type Range = "7d" | "30d" | "90d" | "all";
export type Pattern = "push" | "pull" | "hinge" | "squat" | "carry" | "core";
export type SetLog = {
  exerciseId: string;
  name: string;
  primary: string;
  secondary: string[];
  pattern: Pattern | null;
  reps: number | null;
  weight: number | null;
  warmup: boolean;
  count: number;
};
export type Session = {
  id: string;
  startedAt: string;
  completedAt: string | null;
  dateOnly?: string;
  legacy?: boolean;
  planId?: string | null;
  sets: SetLog[];
};
export type BodyMetric = { date: string; weight: number };
export type Schedule = { date: string; sessionId: string | null };
export type LibraryItem = {
  id: string;
  name: string;
  kind: "exercise" | "workout";
  savedAt: string | null;
};
export type RawData = {
  sessions: Session[];
  body: BodyMetric[];
  schedule: Schedule[];
  library: LibraryItem[];
  errors: string[];
};
export type Point = {
  date: string;
  volume: number | null;
  sessions: number;
  duration: number | null;
};
export type Strength = {
  id: string;
  name: string;
  count: number;
  points: { date: string; value: number }[];
  current: number | null;
  change: number | null;
  trend: "Trending up" | "Holding steady" | "Down recently" | null;
};
export type Snapshot = {
  sessions: number;
  volume: number | null;
  duration: number | null;
  consistency: number | null;
};
export type Metrics = {
  snapshot: Snapshot;
  previous: Snapshot | null;
  totalSessions: number;
  legacy: boolean;
  weekly: Point[];
  muscles: { name: string; value: number }[];
  patterns: { name: Pattern; value: number }[];
  strength: Strength[];
  days: { date: string; volume: number; names: string[]; sessions: number }[];
  variety: number;
  frequency: number;
  previousFrequency: number;
  avgGap: number | null;
  longestGap: number | null;
  body: { date: string; weight: number; average: number }[];
  bodySlope: number | null;
  library: (LibraryItem & {
    count: number;
    daysSince: number | null;
    unused: boolean;
  })[];
};
export type Insight = {
  id: string;
  severity: "info" | "suggestion";
  title: string;
  body: string;
  action?: { label: string; href: string };
  metric: string;
};
export type AnalysisData = {
  range: Range;
  timezone: string;
  unit: "kg" | "lb";
  metrics: Metrics;
  insights: Insight[];
  errors: string[];
};
