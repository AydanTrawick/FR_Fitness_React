import fs from "node:fs/promises";
import postgres from "postgres";
if (!process.env.NEON_DATABASE_URL)
  throw new Error("NEON_DATABASE_URL is required.");
const sql = postgres(process.env.NEON_DATABASE_URL, { ssl: "require", max: 1 });
try {
  await sql.unsafe(await fs.readFile("database/010_programs.sql", "utf8"));
  console.log("Program persistence migration complete.");
} finally {
  await sql.end();
}
