import { auth } from "@/lib/auth";
import { db } from "@/lib/database";
import { checkOrigin } from "@/lib/server";
import { z } from "zod";
import { sharedRateStorage } from "@/lib/auth/rate-storage";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = z
      .object({ token: z.string().min(20).max(200), change: z.string().uuid() })
      .parse(await request.json());
    const limit = await sharedRateStorage.consume(
      "undo-email:" + request.headers.get("x-forwarded-for"),
      { window: 60, max: 5 },
    );
    if (!limit.allowed)
      return Response.json(
        { error: "Too many attempts. Please wait." },
        { status: 429 },
      );
    const context = await auth.$context;
    const proof = await context.internalAdapter.consumeVerificationValue(
      "firstrep-email-undo:" + body.token,
    );
    if (!proof || new Date(proof.expiresAt).getTime() <= Date.now())
      throw new Error("Expired");
    const identity = z
      .object({ userId: z.string(), changeId: z.string().uuid() })
      .parse(JSON.parse(proof.value));
    if (identity.changeId !== body.change) throw new Error("Invalid change");
    await db().begin(async (tx) => {
      const changes =
        await tx`SELECT * FROM firstrep_email_history WHERE id=${body.change} AND user_id=${identity.userId} AND changed_at>NOW()-INTERVAL '24 hours' AND undone_at IS NULL FOR UPDATE`;
      if (!changes[0]) throw new Error("Expired");
      const change = changes[0];
      const current =
        await tx`SELECT email FROM "user" WHERE id=${identity.userId} AND deleted_at IS NULL FOR UPDATE`;
      if (current[0]?.email !== change.new_email)
        throw new Error("Email already changed");
      await tx`UPDATE "user" SET email=${change.old_email},email_verified=true,updated_at=NOW() WHERE id=${identity.userId}`;
      await tx`UPDATE firstrep_users SET email=${change.old_email} WHERE id=${identity.userId}`;
      await tx`UPDATE firstrep_email_history SET undone_at=NOW() WHERE id=${body.change}`;
      await tx`DELETE FROM "session" WHERE user_id=${identity.userId}`;
      await tx`INSERT INTO firstrep_audit_log(user_id,event) VALUES (${identity.userId},'email-change-undone')`;
    });
    return Response.json({ restored: true });
  } catch {
    return Response.json(
      { error: "This undo link is invalid, expired, or already used." },
      { status: 400 },
    );
  }
}
