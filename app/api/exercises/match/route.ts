import { z } from "zod";
import { db, HttpError, rateLimit } from "@/lib/server";
import {
  canonicalCatalog,
  type TaxonomyExercise,
} from "@/lib/exercise-taxonomy";
import { matchExercise } from "@/lib/exercise-match";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    rateLimit(
      `exercise-match:${request.headers.get("x-forwarded-for") ?? "local"}`,
      2000,
    );
    const { name } = z
      .object({ name: z.string().trim().min(1).max(300) })
      .parse({ name: new URL(request.url).searchParams.get("name") });
    const catalog = await db()<
      TaxonomyExercise[]
    >`SELECT id, name, source FROM exercises`;
    const canonical = canonicalCatalog(catalog);
    const byId = new Map(
      canonical.flatMap((e) => [
        [e.id, e] as const,
        ...(e.aliases ?? []).map((id) => [id, e] as const),
      ]),
    );
    const result = matchExercise(name, catalog);
    const resolve = (item: { id: string; name: string }) => {
      const e = byId.get(item.id);
      return e ? { id: e.id, name: e.name } : item;
    };
    return Response.json(
      {
        ...result,
        match: result.match ? resolve(result.match) : null,
        candidates: [
          ...new Map(
            result.candidates.map((item) => {
              const e = resolve(item);
              return [e.id, e];
            }),
          ).values(),
        ],
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof HttpError
            ? error.message
            : "Could not match that exercise.",
      },
      { status: error instanceof HttpError ? error.status : 400 },
    );
  }
}
