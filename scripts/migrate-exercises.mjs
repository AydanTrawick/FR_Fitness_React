import fs from "node:fs";
import postgres from "postgres";
const sql = postgres(process.env.NEON_DATABASE_URL, { ssl: "require", max: 1 });
try {
  await sql.unsafe(
    fs.readFileSync("database/003_exercise_library.sql", "utf8"),
  );
  const catalog = JSON.parse(fs.readFileSync("lib/exercises.json", "utf8"));
  await sql.begin(async (tx) => {
    for (const exercise of catalog)
      await tx`INSERT INTO firstrep_exercises(id,metadata) VALUES(${exercise.id},${tx.json(exercise)}) ON CONFLICT(id) DO UPDATE SET metadata=EXCLUDED.metadata`;
  });
  console.log(`Migration complete. Seeded ${catalog.length} exercises.`);
} finally {
  await sql.end();
}
