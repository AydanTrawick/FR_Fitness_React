import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, requireUser, HttpError } from "./server";
import { workoutSchema, type WorkoutInput } from "./workouts";
export async function exerciseApi(request: Request, path: string[]) {
  const user = await requireUser();
  const sql = db();
  const method = request.method;
  const read = async (id?: string) => {
    const rows =
      await sql`SELECT id,name,description,favorite,created_at AS "createdAt",updated_at AS "updatedAt" FROM firstrep_saved_workouts WHERE user_id=${user.id} ${id ? sql`AND id=${id}` : sql``} ORDER BY updated_at DESC`;
    return Promise.all(
      rows.map(async (w) => ({
        ...w,
        exercises:
          await sql`SELECT exercise_id AS "exerciseId",sets,mode,reps,duration,weight,rest,notes FROM firstrep_saved_workout_exercises WHERE workout_id=${w.id} ORDER BY position`,
      })),
    );
  };
  if (path[1] === "favorites") {
    if (method === "GET")
      return {
        favorites: (
          await sql`SELECT exercise_id FROM firstrep_favorite_exercises WHERE user_id=${user.id}`
        ).map((r) => r.exercise_id),
      };
    if (method === "PUT") {
      const body = z
        .object({ exerciseId: z.string(), favorite: z.boolean() })
        .parse(await request.json());
      if (
        !(await sql`SELECT id FROM exercises WHERE id=${body.exerciseId}`)
          .length
      )
        throw new HttpError("Exercise not found.", 404);
      if (body.favorite)
        await sql`INSERT INTO firstrep_favorite_exercises(user_id,exercise_id) VALUES(${user.id},${body.exerciseId}) ON CONFLICT DO NOTHING`;
      else
        await sql`DELETE FROM firstrep_favorite_exercises WHERE user_id=${user.id} AND exercise_id=${body.exerciseId}`;
      return { saved: true };
    }
  }
  if (path[1] === "workouts") {
    const id = path[2] ? z.uuid().parse(path[2]) : undefined;
    if (method === "GET") {
      const workouts = await read(id);
      if (id && !workouts.length)
        throw new HttpError("Workout not found.", 404);
      return { workouts };
    }
    if (method === "DELETE" && id) {
      const rows =
        await sql`DELETE FROM firstrep_saved_workouts WHERE id=${id} AND user_id=${user.id} RETURNING id`;
      if (!rows.length) throw new HttpError("Workout not found.", 404);
      return { deleted: true };
    }
    if (method === "PATCH" && id) {
      const body = z
        .object({ favorite: z.boolean() })
        .parse(await request.json());
      const rows =
        await sql`UPDATE firstrep_saved_workouts SET favorite=${body.favorite} WHERE id=${id} AND user_id=${user.id} RETURNING id`;
      if (!rows.length) throw new HttpError("Workout not found.", 404);
      return { workout: (await read(id))[0] };
    }
    if ((method === "POST" && !id) || (method === "PUT" && id)) {
      const body = workoutSchema.parse(await request.json());
      const requestedIds = [
        ...new Set(body.exercises.map((e) => e.exerciseId)),
      ];
      const known =
        await sql`SELECT id FROM exercises WHERE id IN ${sql(requestedIds)}`;
      if (known.length !== requestedIds.length)
        throw new HttpError("Unknown exercise. Refresh the catalog.");
      const nextId = id ?? randomUUID();
      await sql.begin(async (tx) => {
        if (id) {
          const existing =
            await tx`SELECT updated_at FROM firstrep_saved_workouts WHERE id=${id} AND user_id=${user.id} FOR UPDATE`;
          if (!existing.length) throw new HttpError("Workout not found.", 404);
          if (
            !body.updatedAt ||
            new Date(existing[0].updated_at).getTime() !==
              new Date(body.updatedAt).getTime()
          )
            throw new HttpError(
              "This workout changed in another session. Reopen it before saving.",
              409,
            );
          await tx`UPDATE firstrep_saved_workouts SET name=${body.name},description=${body.description},updated_at=date_trunc('milliseconds',clock_timestamp()) WHERE id=${id} AND user_id=${user.id}`;
          await tx`DELETE FROM firstrep_saved_workout_exercises WHERE workout_id=${id}`;
        } else
          await tx`INSERT INTO firstrep_saved_workouts(id,user_id,name,description) VALUES(${nextId},${user.id},${body.name},${body.description})`;
        const rows = body.exercises.map(
          (e: WorkoutInput["exercises"][number], position: number) => ({
            workout_id: nextId,
            position,
            exercise_id: e.exerciseId,
            sets: e.sets,
            mode: e.mode,
            reps: e.reps,
            duration: e.duration,
            weight: e.weight,
            rest: e.rest,
            notes: e.notes,
          }),
        );
        await tx`INSERT INTO firstrep_saved_workout_exercises ${tx(rows)}`;
      });
      return { workout: (await read(nextId))[0] };
    }
  }
  throw new HttpError("Not found.", 404);
}
