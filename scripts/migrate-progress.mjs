import fs from "node:fs";
import postgres from "postgres";
if (!process.env.NEON_DATABASE_URL)
  throw new Error("NEON_DATABASE_URL is required.");
const sql = postgres(process.env.NEON_DATABASE_URL, { ssl: "require", max: 1 });
try {
  await sql`CREATE TABLE IF NOT EXISTS firstrep_schema_migrations(name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  const file = "database/009_progress_coach.sql";
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(923009)`;
    if (
      (await tx`SELECT name FROM firstrep_schema_migrations WHERE name=${file}`)
        .length
    )
      return;
    await tx.unsafe(
      fs.readFileSync(file, "utf8").replace(/^BEGIN;|^COMMIT;/gm, ""),
    );
    await tx`INSERT INTO firstrep_schema_migrations(name) VALUES (${file})`;
    console.log("Applied " + file);
  });
} finally {
  await sql.end();
}
