import fs from "node:fs";
import { groupFor, repBased } from "../lib/session/model.ts";
import postgres from "postgres";
if (!process.env.NEON_DATABASE_URL)
  throw new Error("NEON_DATABASE_URL is required.");
const sql = postgres(process.env.NEON_DATABASE_URL, { ssl: "require", max: 1 });
try {
  await sql`CREATE TABLE IF NOT EXISTS firstrep_schema_migrations(name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  const file = "database/012_live_session_builder.sql";
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(923012)`;
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
  await sql`ALTER TABLE exercises ADD COLUMN IF NOT EXISTS is_rep_based boolean`;
  const exercises =
    await sql`SELECT id,primary_muscle,primary_muscles,metadata,category FROM exercises`;
  await sql.begin(async (tx) => {
    for (const e of exercises)
      await tx`UPDATE exercises SET is_rep_based=${repBased(e)}, muscle_group=${groupFor(e.primary_muscle ?? e.primary_muscles?.[0])} WHERE id=${e.id}`;
  });
  console.log("Updated exercise muscle groups.");
} finally {
  await sql.end();
}
