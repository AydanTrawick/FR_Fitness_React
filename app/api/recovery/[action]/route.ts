import { getAuth } from "@/lib/auth";
import { z } from "zod";
import { emailSchema } from "@/lib/auth/validation";
import { db, HttpError } from "@/lib/database";
import { checkOrigin } from "@/lib/server";
import { sharedRateStorage } from "@/lib/auth/rate-storage";
import { accountMail } from "@/lib/auth/mail";
import { audit } from "@/lib/auth/account-service";
import { after } from "next/server";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    checkOrigin(request);
    const { action } = await params;
    if (!["start", "finish", "cancel"].includes(action))
      throw new HttpError("Not found.", 404);
    const body = z
      .object({ email: emailSchema, otp: z.string().regex(/^\d{6}$/) })
      .parse(await request.json());
    const limit = await sharedRateStorage.consume(
      "recovery:" +
        body.email +
        ":" +
        (request.headers.get("x-forwarded-for") || "local"),
      { window: 60, max: 5 },
    );
    if (!limit.allowed)
      throw new HttpError("Too many attempts. Please wait a minute.", 429);
    // Verify and consume the email code using Better Auth. Its 2FA challenge
    // deletes the temporary session, so recovery never unlocks app access.
    const proof = await getAuth().handler(
      new Request(new URL("/api/auth/sign-in/email-otp", request.url), {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(body),
      }),
    );
    const result = await proof.json();
    if (!proof.ok || !result.twoFactorRedirect)
      throw new HttpError(
        "Check your email code and try again. Recovery is only for accounts with two-factor enabled.",
      );
    const users =
      await db()`SELECT id,email,deleted_at FROM "user" WHERE email=${body.email} AND two_factor_enabled=true`;
    const user = users[0];
    if (!user || user.deleted_at)
      throw new HttpError("Unable to complete recovery.");
    if (action === "start") {
      await db()`INSERT INTO firstrep_recovery_request(user_id) VALUES (${user.id}) ON CONFLICT(user_id) DO UPDATE SET created_at=CASE WHEN firstrep_recovery_request.cancelled_at IS NOT NULL THEN NOW() ELSE firstrep_recovery_request.created_at END,eligible_at=CASE WHEN firstrep_recovery_request.cancelled_at IS NOT NULL THEN NOW()+INTERVAL '24 hours' ELSE firstrep_recovery_request.eligible_at END,cancelled_at=NULL`;
      await audit(user.id, "two-factor-recovery-requested", request);
      after(() =>
        accountMail(
          user.email,
          "FirstRep two-factor recovery requested",
          "A request to remove your authenticator will be eligible after a 24-hour wait. Sign in and cancel it from Security settings if you did not request this.",
          {
            url:
              (process.env.BETTER_AUTH_URL || "http://localhost:3000") +
              "/settings/security",
          },
        ),
      );
      return Response.json({
        message:
          "Recovery is scheduled. After 24 hours, verify a fresh email code here to complete it.",
      });
    }
    if (action === "cancel") {
      await db()`UPDATE firstrep_recovery_request SET cancelled_at=NOW() WHERE user_id=${user.id}`;
      await audit(user.id, "two-factor-recovery-cancelled", request);
      return Response.json({ message: "Recovery request cancelled." });
    }
    const eligible =
      await db()`SELECT user_id FROM firstrep_recovery_request WHERE user_id=${user.id} AND eligible_at<=NOW() AND cancelled_at IS NULL`;
    if (!eligible.length)
      throw new HttpError(
        "The 24-hour wait has not ended, or your recovery request was cancelled.",
        403,
      );
    const context = await getAuth().$context;
    await context.internalAdapter.updateUser(user.id, {
      twoFactorEnabled: false,
    });
    await context.adapter.deleteMany({
      model: "twoFactor",
      where: [{ field: "userId", value: user.id }],
    });
    await context.internalAdapter.deleteUserSessions(user.id);
    await db()`UPDATE firstrep_recovery_request SET cancelled_at=NOW() WHERE user_id=${user.id}`;
    await audit(user.id, "two-factor-recovered", request);
    after(() =>
      accountMail(
        user.email,
        "FirstRep two-factor recovery completed",
        "The lost authenticator has been removed and existing sessions signed out. Sign in again, then add a new authenticator.",
        {
          url:
            (process.env.BETTER_AUTH_URL || "http://localhost:3000") + "/auth",
        },
      ),
    );
    return Response.json({
      message:
        "Your authenticator was removed. Sign in again, then set up two-factor authentication.",
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof HttpError
            ? e.message
            : e instanceof z.ZodError
              ? e.issues[0].message
              : "Unable to verify recovery. Please try again.",
      },
      { status: e instanceof HttpError ? e.status : 400 },
    );
  }
}
