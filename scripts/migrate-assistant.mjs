import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const migrationName = "database/011_voice_assistant.sql";
const migrationUrl = new URL(
  "../database/011_voice_assistant.sql",
  import.meta.url,
);
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const hashFlag = args.indexOf("--reviewed-sha256");
const reviewedHash = hashFlag >= 0 ? args[hashFlag + 1] : undefined;
const allowedArgs = args.filter((_, i) => i !== hashFlag && i !== hashFlag + 1);
if (
  hashFlag === -1
    ? args.some((a) => a !== "--apply")
    : allowedArgs.some((a) => a !== "--apply")
) {
  throw new Error(
    "Usage: node scripts/migrate-assistant.mjs [--apply --reviewed-sha256 HASH]",
  );
}
const source = await readFile(migrationUrl, "utf8");
const hash = createHash("sha256").update(source).digest("hex");
if (!apply) {
  console.log(
    `PREVIEW ONLY: no database connection.\nFile: ${migrationName}\nSHA-256: ${hash}\n`,
  );
  console.log(source);
} else {
  if (
    !reviewedHash ||
    !/^[a-f0-9]{64}$/.test(reviewedHash) ||
    reviewedHash !== hash
  ) {
    throw new Error(
      "The reviewed SHA-256 must match the migration file exactly. No database connection was made.",
    );
  }
  if (!process.env.NEON_DATABASE_URL)
    throw new Error("NEON_DATABASE_URL is required.");
  let target;
  try {
    target = new URL(process.env.NEON_DATABASE_URL);
  } catch {
    throw new Error("NEON_DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (!["postgres:", "postgresql:"].includes(target.protocol))
    throw new Error("A PostgreSQL connection URL is required.");
  if (
    (source.match(/^BEGIN;$/gm) || []).length !== 1 ||
    (source.match(/^COMMIT;$/gm) || []).length !== 1
  ) {
    throw new Error(
      "The reviewed migration must contain exactly one transaction. No database connection was made.",
    );
  }
  console.log(
    `Applying reviewed migration ${migrationName} (${hash}) to ${target.hostname}${target.pathname}`,
  );
  const { default: postgres } = await import("postgres");
  const sql = postgres(process.env.NEON_DATABASE_URL, {
    ssl: "require",
    max: 1,
    connect_timeout: 10,
  });
  try {
    const applied = await sql.begin(async (tx) => {
      await tx`SET LOCAL lock_timeout = '5s'`;
      await tx`SET LOCAL statement_timeout = '30s'`;
      await tx`SELECT pg_advisory_xact_lock(hashtext('firstrep:011_voice_assistant'))`;
      const [ledger] =
        await tx`SELECT to_regclass('public.firstrep_schema_migrations') IS NOT NULL AS present`;
      if (
        ledger.present &&
        (
          await tx`SELECT name FROM public.firstrep_schema_migrations WHERE name=${migrationName}`
        ).length
      )
        return false;
      await tx.unsafe(source.replace(/^BEGIN;$|^COMMIT;$/gm, ""));
      return true;
    });
    console.log(
      applied
        ? "Voice assistant migration committed."
        : "Already applied; no schema changes made.",
    );
  } finally {
    await sql.end();
  }
}
