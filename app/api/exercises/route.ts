import { matchesGroup, repBased } from "@/lib/session/model";
import { requireUser, HttpError } from "@/lib/server";
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
    const builder =
      params.has("repBasedOnly") || params.has("group") || params.has("cursor");
    const user = builder ? await requireUser() : null;
    const sql = db();
    const exercises = await sql<ExerciseRow[]>`
      SELECT id, name, primary_muscles, primary_muscle, secondary_muscles, movement_pattern,
             equipment, is_compound, force, level, mechanic, category,
             instructions, images, metadata, source, media_url
      FROM exercises
      ORDER BY name, id
    `;
    const q = !builder || search.length >= 2 ? search.toLowerCase() : "";
    const rank = (e: ExerciseRow) =>
      !q || e.name.toLowerCase().startsWith(q)
        ? 0
        : e.name.toLowerCase().includes(q)
          ? 1
          : 2;
    const collection = params.get("collection");
    let selectedIds: Set<string> | null = null;
    if (user && collection === "favorites")
      selectedIds = new Set(
        (
          await sql`SELECT exercise_id FROM firstrep_favorite_exercises WHERE user_id=${user.id}`
        ).map((r) => String(r.exercise_id)),
      );
    if (user && collection === "recent")
      selectedIds = new Set(
        (
          await sql`SELECT DISTINCT exercise_id FROM firstrep_workout_entries WHERE user_id=${user.id} AND date >= CURRENT_DATE - INTERVAL '30 days'`
        ).map((r) => String(r.exercise_id)),
      );
    const all = canonicalCatalog(exercises)
      .filter(
        (e) =>
          (!builder || repBased(e)) &&
          (!selectedIds ||
            selectedIds.has(e.id) ||
            e.aliases?.some((id) => selectedIds.has(id))) &&
          matchesGroup(e, params.get("group") ?? "") &&
          (!muscle ||
            [
              e.primary_muscle,
              ...e.primary_muscles,
              ...e.secondary_muscles,
            ].some((m) => m?.toLowerCase() === muscle.toLowerCase())) &&
          (!equipment ||
            e.equipment?.toLowerCase() === equipment.toLowerCase()) &&
          (!q ||
            [
              e.name,
              e.primary_muscle,
              ...e.secondary_muscles,
              e.equipment,
              ...(e.aliases ?? []),
            ].some((s) => s?.toLowerCase().includes(q))),
      )
      .sort(
        (a, b) =>
          rank(a) - rank(b) ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id),
      );
    let start = 0;
    if (params.get("cursor")) {
      try {
        const cursor = JSON.parse(
          Buffer.from(params.get("cursor")!, "base64url").toString(),
        );
        start =
          all.findIndex((e) => e.name === cursor.name && e.id === cursor.id) +
          1;
      } catch {
        return Response.json({ error: "Invalid cursor." }, { status: 400 });
      }
    }
    const page = all.slice(start, start + requestedLimit);
    const last = page.at(-1);
    return Response.json(
      {
        total: all.length,
        nextCursor:
          last && start + requestedLimit < all.length
            ? Buffer.from(
                JSON.stringify({ name: last.name, id: last.id }),
              ).toString("base64url")
            : null,
        exercises: page.map((exercise) => ({
          ...exercise,
          images: exercise.images.map(exerciseImageUrl),
        })),
      },
      {
        headers: {
          "Cache-Control": builder
            ? "private, max-age=0"
            : "public, s-maxage=300",
        },
      },
    );
  } catch (error) {
    if (error instanceof HttpError)
      return Response.json({ error: error.message }, { status: error.status });
    console.error("Exercise catalog query failed", error);
    return Response.json(
      { error: "The exercise catalog is temporarily unavailable." },
      { status: 503 },
    );
  }
}
