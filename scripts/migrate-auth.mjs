import fs from "node:fs";
import postgres from "postgres";
if (!process.env.NEON_DATABASE_URL)
  throw new Error("NEON_DATABASE_URL is required.");
const sql = postgres(process.env.NEON_DATABASE_URL, { ssl: "require", max: 1 });
try {
  await sql`CREATE TABLE IF NOT EXISTS firstrep_schema_migrations(name TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  for (const file of [
    ...fs
      .readdirSync("database/auth-generated")
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => "database/auth-generated/" + f),
    "database/007_auth_accounts.sql",
    "database/008_account_jobs.sql",
  ]) {
    if (
      (
        await sql`SELECT name FROM firstrep_schema_migrations WHERE name=${file}`
      ).length
    )
      continue;
    await sql.begin(async (tx) => {
      const text = fs
        .readFileSync(file, "utf8")
        .replace(/^BEGIN;|^COMMIT;/gm, "");
      await tx.unsafe(text);
      await tx`INSERT INTO firstrep_schema_migrations(name) VALUES (${file})`;
    });
    console.log("Applied " + file);
  }
} finally {
  await sql.end();
}
