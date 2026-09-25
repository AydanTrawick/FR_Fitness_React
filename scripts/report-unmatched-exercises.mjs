import postgres from "postgres";

if (!process.env.NEON_DATABASE_URL) throw new Error("NEON_DATABASE_URL is required.");
const sql = postgres(process.env.NEON_DATABASE_URL, { ssl: "require", max: 1 });
const normalize = (value) => value.toLowerCase().replace(/[_-]/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = old;
    }
  }
  return row[b.length];
}
try {
  const [unmatched, catalog] = await Promise.all([
    sql`SELECT exercise, count(*)::int AS rows, sum(sets)::int AS sets FROM firstrep_workout_entries WHERE exercise_id IS NULL GROUP BY exercise ORDER BY rows DESC, exercise`,
    sql`SELECT id, name FROM exercises`,
  ]);
  for (const row of unmatched) {
    const query = normalize(row.exercise);
    const suggestions = catalog.map((e) => ({ id: e.id, name: e.name, score: 1 - distance(query, normalize(e.name)) / Math.max(query.length, normalize(e.name).length, 1) }))
      .sort((a, b) => b.score - a.score).slice(0, 5);
    console.log(JSON.stringify({ ...row, suggestions }));
  }
  console.log(`${unmatched.length} unmatched exercise names. No fuzzy matches were applied.`);
} finally {
  await sql.end();
}
