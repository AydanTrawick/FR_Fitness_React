import { limits } from "@/lib/ratelimit/limiters";
import { rateErrorResponse } from "@/lib/ratelimit/respond";
import { z } from "zod";
import { requireAccountSession } from "@/lib/auth-session";
import { checkOrigin } from "@/lib/server";
import { db, HttpError } from "@/lib/database";
import {
  acquireLease,
  coachLimit,
  confirmGoal,
  localDate,
  progressState,
  reviewAdjustment,
  saveCheckin,
} from "@/lib/progress/service";
import {
  deleteAllPhotos,
  photoConsent,
  photoStorageReady,
  servePhoto,
  signedPhotoUrl,
  uploadPhoto,
} from "@/lib/progress/photos";
export const runtime = "nodejs";
export const maxDuration = 300;
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function handle(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  let release: (() => Promise<void>) | undefined;
  let releasePlan: (() => Promise<void>) | undefined;
  try {
    if (request.method !== "GET") checkOrigin(request);
    const { user } = await requireAccountSession(request);
    const path = (await context.params).path || [];
    const route = path.join("/");
    const method = request.method;
    if (!route && method === "GET") {
      const state = await progressState(user.id, user.timezone);
      state.capabilities.photos =
        photoStorageReady() && state.capabilities.coach;
      return json(state);
    }
    if (path[0] === "photos" && path[1] && method === "GET") {
      const id = z.uuid().parse(path[1]);
      if (path[2] === "url")
        return json({ url: await signedPhotoUrl(user.id, id) });
      if (path.length === 2)
        return await servePhoto(user.id, id, new URL(request.url));
    }
    if (route === "adjustments" && method === "GET") {
      const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
      const rows =
        await db()`SELECT a.proposed,a.reason,a.summary FROM adjustments a JOIN playbooks p ON p.id=a.playbook_id WHERE a.id=${id} AND p.user_id=${user.id}`;
      if (!rows.length) throw new HttpError("Adjustment not found.", 404);
      return json(rows[0]);
    }
    if (method === "POST" || method === "DELETE")
      release = await acquireLease(user.id);
    if (route === "checkins" && method === "POST") {
      await coachLimit("checkin:" + user.id, 60);
      return json({ id: await saveCheckin(user.id, await request.json()) });
    }
    if (route === "consent" && method === "POST") {
      const body = z
        .object({ consent: z.literal(true), adult: z.literal(true) })
        .parse(await request.json());
      await photoConsent(user.id, body.adult);
      return json({ saved: true });
    }
    if (route === "photos" && method === "POST") {
      await coachLimit("photos:" + user.id, 12);
      return json(await uploadPhoto(user.id, request));
    }
    if (route === "photos" && method === "DELETE") {
      await deleteAllPhotos(user.id);
      return json({ deleted: true });
    }
    if (route === "goals/confirm" && method === "POST") {
      const body = z.object({ id: z.uuid() }).parse(await request.json());
      releasePlan = await limits.beginPlan(user.id, request);
      return json({
        playbook_id: await confirmGoal(user.id, body.id, request.signal),
      });
    }
    if (route === "adjustments" && method === "POST") {
      const body = z
        .object({ id: z.uuid(), accepted: z.boolean() })
        .parse(await request.json());
      await reviewAdjustment(user.id, body.id, body.accepted);
      return json({ saved: true });
    }
    if (route === "habits" && method === "POST") {
      const body = z
        .object({ id: z.uuid(), done: z.boolean() })
        .parse(await request.json());
      if (
        !(
          await db()`SELECT i.id FROM playbook_items i JOIN playbooks p ON p.id=i.playbook_id WHERE i.id=${body.id} AND p.user_id=${user.id} AND i.type='habit'`
        ).length
      )
        throw new HttpError("Habit not found.", 404);
      await db()`INSERT INTO habit_logs(playbook_item_id,date,done) VALUES (${body.id},${localDate(user.timezone)},${body.done}) ON CONFLICT(playbook_item_id,date) DO UPDATE SET done=excluded.done`;
      return json({ saved: true });
    }
    throw new HttpError("Not found.", 404);
  } catch (error) {
    const limited = rateErrorResponse(error);
    if (limited) return limited;
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json({ error: "Check the entered values and try again." }, 400);
    console.error(
      "Progress request failed",
      error instanceof Error ? error.message : "Unknown server error",
    );
    return json(
      {
        error:
          "Progress could not be loaded or saved. Check the database migration and service configuration, then retry.",
      },
      503,
    );
  } finally {
    await releasePlan?.();
    await release?.();
  }
}
export { handle as GET, handle as POST, handle as DELETE };
