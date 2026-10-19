import { db } from "@/lib/server";
import { exerciseImageUrl, type ExerciseRow } from "@/lib/exercise-catalog";

import { canonicalCatalog } from "@/lib/exercise-taxonomy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const muscle = (params.get("muscle") ?? "").trim();
  const equipment = (params.get("equipment") ?? "").trim();
  const search = (params.get("search") ?? params.get("q") ?? "").trim();
  const requestedLimit = Number(params.get("limit") ?? 1000);
  if (
    [muscle, equipment, search].some((part) => part.length > 100) ||
    !Number.isInteger(requestedLimit) ||
    requestedLimit < 1 ||
    requestedLimit > 1000
  ) {
    return Response.json(
      { error: "Invalid exercise filter." },
      { status: 400 },
    );
  }
  try {
    const sql = db();
    const exercises = await sql<ExerciseRow[]>`
      SELECT id, name, primary_muscles, primary_muscle, secondary_muscles, movement_pattern,
             equipment, is_compound, force, level, mechanic, category,
             instructions, images, metadata, source
      FROM exercises
      ORDER BY name, id
    `;
    return Response.json(
      {
        exercises: canonicalCatalog(exercises)
          .filter(
            (e) =>
              (!muscle ||
                e.primary_muscle?.toLowerCase() === muscle.toLowerCase() ||
                e.primary_muscles.some(
                  (m) => m.toLowerCase() === muscle.toLowerCase(),
                ) ||
                e.secondary_muscles.some(
                  (m) => m.toLowerCase() === muscle.toLowerCase(),
                )) &&
              (!equipment ||
                e.equipment?.toLowerCase() === equipment.toLowerCase()) &&
              (!search || e.name.toLowerCase().includes(search.toLowerCase())),
          )
          .slice(0, requestedLimit)
          .map((exercise) => ({
            ...exercise,
            images: exercise.images.map(exerciseImageUrl),
          })),
      },
      { headers: { "Cache-Control": "public, s-maxage=300" } },
    );
  } catch (error) {
    console.error("Exercise catalog query failed", error);
    return Response.json(
      { error: "The exercise catalog is temporarily unavailable." },
      { status: 503 },
    );
  }
}
