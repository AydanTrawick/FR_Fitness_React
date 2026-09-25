import fs from "node:fs/promises";
import postgres from "postgres";

const DATA_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const databaseUrl = process.env.NEON_DATABASE_URL;
if (!databaseUrl) throw new Error("NEON_DATABASE_URL is required.");

const response = await fetch(DATA_URL, { signal: AbortSignal.timeout(30000) });
if (!response.ok)
  throw new Error(`Exercise download failed: HTTP ${response.status}`);
const records = await response.json();
if (!Array.isArray(records) || records.length < 800)
  throw new Error(
    "The exercise feed is incomplete or has an unexpected format.",
  );

const ids = new Set();
const rows = records.map((item) => {
  if (
    !item ||
    typeof item.id !== "string" ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(item.id) ||
    typeof item.name !== "string" ||
    !item.name.trim() ||
    !Array.isArray(item.primaryMuscles) ||
    !Array.isArray(item.secondaryMuscles) ||
    !Array.isArray(item.instructions) ||
    !Array.isArray(item.images) ||
    ids.has(item.id)
  )
    throw new Error(`Invalid or duplicate exercise: ${String(item?.id)}`);
  ids.add(item.id);
  const strings = (value) => value.every((v) => typeof v === "string");
  if (
    ![
      item.primaryMuscles,
      item.secondaryMuscles,
      item.instructions,
      item.images,
    ].every(strings)
  )
    throw new Error(`Invalid list field: ${item.id}`);
  if (
    item.images.some(
      (image) => !/^[A-Za-z0-9_./-]+$/.test(image) || image.includes(".."),
    )
  )
    throw new Error(`Invalid image path: ${item.id}`);
  return {
    id: item.id,
    name: item.name.trim(),
    primary_muscles: item.primaryMuscles,
    primary_muscle: item.primaryMuscles[0] ?? null,
    secondary_muscles: item.secondaryMuscles,
    movement_pattern: null,
    equipment: item.equipment ?? null,
    is_compound: item.mechanic == null ? null : item.mechanic === "compound",
    force: item.force ?? null,
    level: item.level ?? null,
    mechanic: item.mechanic ?? null,
    category: item.category ?? null,
    instructions: item.instructions,
    images: item.images,
    metadata: null,
    source: "free-exercise-db",
  };
});

const sql = postgres(databaseUrl, {
  ssl: "require",
  max: 1,
  connect_timeout: 10,
});
try {
  await sql.unsafe(
    await fs.readFile(
      new URL("../database/005_free_exercise_db.sql", import.meta.url),
      "utf8",
    ),
  );
  await sql.begin(async (tx) => {
    for (let offset = 0; offset < rows.length; offset += 100) {
      const batch = rows.slice(offset, offset + 100);
      await tx`
        INSERT INTO exercises ${tx(batch)}
        ON CONFLICT (id) DO UPDATE SET
          name = excluded.name,
          primary_muscles = excluded.primary_muscles,
          primary_muscle = excluded.primary_muscle,
          secondary_muscles = excluded.secondary_muscles,
          equipment = excluded.equipment,
          is_compound = excluded.is_compound,
          force = excluded.force,
          level = excluded.level,
          mechanic = excluded.mechanic,
          category = excluded.category,
          instructions = excluded.instructions,
          images = excluded.images,
          source = excluded.source
      `;
    }
  });
  console.log(`Seeded ${rows.length} exercises from ${DATA_URL}.`);
} finally {
  await sql.end();
}
