import type { Entry, Logs } from "./tracking";

export function dashboardDate(now = new Date(), timezone?: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function shiftDate(date: string, offset: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
export function dayLabel(date: string, options: Intl.DateTimeFormatOptions) {
  return new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
    ...options,
    timeZone: "UTC",
  });
}
const sets = (row: Entry) => Math.max(0, Number(row.sets) || 0);
export const workoutVolume = (row: Entry) =>
  sets(row) * (Number(row.reps) || 0) * (Number(row.weight_kg) || 0);
export function dashboardStats(logs: Logs, date: string) {
  const workouts = logs.workout.filter((r) => r.date === date);
  const food = logs.food.filter((r) => r.date === date);
  // Measurements are timestamps, unlike date-only workout and food entries.
  const checkins = logs.bmi.filter((r) => {
    const timestamp = new Date(String(r.recorded_at));
    return Number.isFinite(timestamp.getTime());
  });
  const trainingDays = new Set(
    logs.workout
      .filter((r) => sets(r) > 0 && String(r.date) <= date)
      .map((r) => String(r.date)),
  );
  const days = Array.from({ length: 7 }, (_, i) => {
    const key = shiftDate(date, i - 6);
    return {
      date: key,
      volume: logs.workout
        .filter((r) => r.date === key)
        .reduce((s, r) => s + workoutVolume(r), 0),
    };
  });
  const monday = shiftDate(
    date,
    -((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7),
  );
  const week = Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
  const weekTraining = week.filter((d) => trainingDays.has(d)).length;
  const fuelDays = new Set(
    logs.food
      .filter((r) => week.includes(String(r.date)) && String(r.date) <= date)
      .map((r) => String(r.date)),
  ).size;
  let cursor = trainingDays.has(date) ? date : shiftDate(date, -1),
    streak = 0;
  while (trainingDays.has(cursor)) {
    streak++;
    cursor = shiftDate(cursor, -1);
  }
  const bestStreak = [...trainingDays].some((d) =>
    trainingDays.has(shiftDate(d, -1)),
  );
  const volumeByDay = new Map<string, number>();
  const daysByWeek = new Map<string, number>();
  const fuelDates = new Set(
    logs.food.filter((r) => String(r.date) <= date).map((r) => String(r.date)),
  );
  for (const r of logs.workout.filter((r) => String(r.date) <= date)) {
    volumeByDay.set(
      String(r.date),
      (volumeByDay.get(String(r.date)) || 0) + workoutVolume(r),
    );
  }
  for (const d of trainingDays) {
    const monday = shiftDate(
      d,
      -((new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7),
    );
    daysByWeek.set(monday, (daysByWeek.get(monday) || 0) + 1);
  }
  return {
    workouts,
    food,
    checkins,
    trainingDays,
    days,
    week,
    weekTraining,
    fuelDays,
    streak,
    bestStreak,
    sets: workouts.reduce((s, r) => s + sets(r), 0),
    totalSets: logs.workout
      .filter((r) => String(r.date) <= date)
      .reduce((s, r) => s + sets(r), 0),
    volume: workouts.reduce((s, r) => s + workoutVolume(r), 0),
    weekMaxVolume: Math.max(0, ...week.map((d) => volumeByDay.get(d) || 0)),
    allMaxVolume: Math.max(0, ...volumeByDay.values()),
    weekWarrior: [...daysByWeek.values()].some((n) => n >= 4),
    fuelStreak: [...fuelDates].some(
      (d) => fuelDates.has(shiftDate(d, -1)) && fuelDates.has(shiftDate(d, -2)),
    ),
  };
}
