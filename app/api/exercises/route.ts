import { db } from "@/lib/server";
import { exerciseImageUrl, type ExerciseRow } from "@/lib/exercise-catalog";

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
      WHERE (
        ${muscle} = '' OR lower(primary_muscle) = lower(${muscle})
        OR EXISTS (
          SELECT 1 FROM unnest(secondary_muscles) AS secondary
          WHERE lower(secondary) = lower(${muscle})
        )
      )
      AND (${equipment} = '' OR lower(equipment) = lower(${equipment}))
      AND (${search} = '' OR position(lower(${search}) in lower(name)) > 0)
      ORDER BY name, id
      LIMIT ${requestedLimit}
    `;
    return Response.json(
      {
        exercises: exercises.map((exercise) => ({
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
