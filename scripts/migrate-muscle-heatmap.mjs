import fs from "node:fs/promises";
import postgres from "postgres";

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

if (!process.env.NEON_DATABASE_URL) throw new Error("NEON_DATABASE_URL is required.");
const sql = postgres(process.env.NEON_DATABASE_URL, { ssl: "require", max: 1 });
try {
  const source = await fs.readFile("database/006_muscle_heatmap.sql", "utf8");
  const migration = source.slice(0, source.indexOf("\nCOMMIT;") + "\nCOMMIT;".length);
  if (!migration.endsWith("COMMIT;")) throw new Error("Migration file is incomplete.");
  await sql.unsafe(migration);
  const catalog = await sql`SELECT id, name FROM exercises`;
  const names = await sql`SELECT DISTINCT exercise FROM firstrep_workout_entries WHERE exercise_id IS NULL`;
  let fuzzyMatched = 0;
  for (const { exercise } of names) {
    const query = normalize(exercise);
    const ranked = catalog.map((item) => ({
      ...item,
      score: 1 - distance(query, normalize(item.name)) / Math.max(query.length, normalize(item.name).length, 1),
    })).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    // An intentionally conservative fuzzy pass. Close alternatives stay
    // unmatched for human review rather than being guessed into a muscle.
    if (best && best.score >= 0.92 && best.score - (ranked[1]?.score ?? 0) >= 0.15) {
      const updated = await sql`UPDATE firstrep_workout_entries SET exercise_id=${best.id} WHERE exercise_id IS NULL AND exercise=${exercise} RETURNING id`;
      fuzzyMatched += updated.length;
    }
  }
  const unmatched = await sql`SELECT exercise, count(*)::int AS rows, sum(sets)::int AS sets FROM firstrep_workout_entries WHERE exercise_id IS NULL GROUP BY exercise ORDER BY rows DESC, exercise`;
  console.log(`Migration complete. ${fuzzyMatched} grouped rows matched conservatively by fuzzy name; ${unmatched.length} unmatched legacy exercise names remain for review.`);
  for (const row of unmatched) console.log(JSON.stringify(row));
} finally {
  await sql.end();
}
