import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { db, HttpError } from "@/lib/database";
import { checkOrigin } from "@/lib/server";
import { requireAccountSession, requireFresh } from "@/lib/auth-session";
import {
  profileSchema,
  preferencesSchema,
  usernameSchema,
  passwordSchema,
  defaultPreferences,
  TERMS_VERSION,
} from "@/lib/auth/validation";
import { audit, runAccountJobs } from "@/lib/auth/account-service";
import { accountMail } from "@/lib/auth/mail";
import { sharedRateStorage } from "@/lib/auth/rate-storage";
import { after } from "next/server";
export const runtime = "nodejs";
const response = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function handle(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  try {
    if (request.method !== "GET") checkOrigin(request);
    const path = (await context.params).path?.join("/") || "";
    const session = await requireAccountSession(request, path === "restore");
    const user = session.user;
    const sql = db();
    if (request.method !== "GET") {
      const limit = await sharedRateStorage.consume("settings:" + user.id, {
        window: 60,
        max: 30,
      });
      if (!limit.allowed)
        throw new HttpError("Too many changes. Please wait a minute.", 429);
    }
    if (path === "analytics-consent" && request.method === "GET") {
      const rows =
        await sql`SELECT preferences FROM firstrep_user_settings WHERE user_id=${user.id}`;
      return response({ optIn: rows[0]?.preferences?.analyticsOptIn === true });
    }
    if (request.method === "GET" && !path) {
      const settings =
        await sql`SELECT preferences,passkey_prompted FROM firstrep_user_settings WHERE user_id=${user.id}`;
      const activity =
        await sql`SELECT id,event,ip,user_agent,created_at FROM firstrep_audit_log WHERE user_id=${user.id} ORDER BY created_at DESC LIMIT 100`;
      const exports =
        await sql`SELECT id,status,expires_at,created_at FROM firstrep_data_export WHERE user_id=${user.id} ORDER BY created_at DESC LIMIT 5`;
      const recovery =
        await sql`SELECT eligible_at,cancelled_at FROM firstrep_recovery_request WHERE user_id=${user.id}`;
      return response({
        user,
        preferences: { ...defaultPreferences, ...settings[0]?.preferences },
        passkeyPrompted: settings[0]?.passkey_prompted || false,
        activity,
        exports,
        recovery: recovery[0] || null,
        providers: {
          google: !!process.env.GOOGLE_CLIENT_ID,
          apple: !!process.env.APPLE_CLIENT_ID,
        },
        pushAvailable: false,
      });
    }
    if (path === "username-available" && request.method === "GET") {
      const name = usernameSchema
        .parse(new URL(request.url).searchParams.get("username"))
        .toLowerCase();
      const matches =
        await sql`SELECT id FROM "user" WHERE lower(username)=${name} AND id<>${user.id}`;
      const held =
        await sql`SELECT username FROM firstrep_reserved_username WHERE username=${name} AND release_at>NOW() AND user_id<>${user.id}`;
      return response({ available: matches.length === 0 && held.length === 0 });
    }
    if (path.startsWith("export/") && request.method === "GET") {
      const id = z.string().uuid().parse(path.split("/")[1]);
      const rows =
        await sql`SELECT file_bytes FROM firstrep_data_export WHERE id=${id} AND user_id=${user.id} AND status='ready' AND expires_at>NOW()`;
      if (!rows[0]?.file_bytes)
        throw new HttpError(
          "This download is unavailable or has expired. Request a fresh export.",
          404,
        );
      return new Response(new Uint8Array(rows[0].file_bytes), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": 'attachment; filename="firstrep-data.zip"',
          "Cache-Control": "no-store",
        },
      });
    }
    const body = await request.json();
    if (path === "profile" && request.method === "PUT") {
      const values = profileSchema.parse(body);
      if (
        values.image &&
        !(
          /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(
            values.image,
          ) || /^https:\/\//.test(values.image)
        )
      )
        throw new HttpError("Choose a JPG, PNG, or WebP profile photo.");
      await getAuth().api.updateUser({
        headers: request.headers,
        body: values,
      });
      await audit(user.id, "profile-updated", request);
      return response({ saved: true });
    }
    if (path === "username" || path === "onboarding") {
      const name = usernameSchema.parse(body.username).toLowerCase();
      if (path === "onboarding" && body.acceptedTerms !== true)
        throw new HttpError("Accept the Terms and Privacy Policy to continue.");
      await sql.begin(async (tx) => {
        const rows =
          await tx`SELECT username,username_changed_at FROM "user" WHERE id=${user.id} FOR UPDATE`;
        const previous = rows[0];
        for (const locked of [previous.username, name].filter(Boolean).sort())
          await tx`SELECT pg_advisory_xact_lock(hashtext(${locked}))`;
        if (previous.username !== name) {
          if (
            previous.username_changed_at &&
            Date.now() - new Date(previous.username_changed_at).getTime() <
              30 * 86400000
          )
            throw new HttpError(
              "You can change your username once every 30 days.",
            );
          if (
            (
              await tx`SELECT username FROM firstrep_reserved_username WHERE username=${name} AND release_at>NOW() AND user_id<>${user.id}`
            ).length
          )
            throw new HttpError("That username is not available.");
          if (previous.username)
            await tx`INSERT INTO firstrep_reserved_username(username,user_id,release_at) VALUES (${previous.username},${user.id},NOW()+INTERVAL '14 days') ON CONFLICT(username) DO UPDATE SET user_id=EXCLUDED.user_id,release_at=EXCLUDED.release_at`;
          await tx`UPDATE "user" SET username=${name},display_username=${name},username_changed_at=NOW(),updated_at=NOW() WHERE id=${user.id}`;
        }
        if (path === "onboarding") {
          const settings = z
            .object({
              goal: z.enum(["strength", "muscle", "fitness", "consistency"]),
              weightUnit: z.enum(["kg", "lb"]),
              distanceUnit: z.enum(["km", "mi"]),
              timezone: z.string().max(100),
            })
            .parse(body);
          await tx`UPDATE "user" SET goal=${settings.goal},weight_unit=${settings.weightUnit},distance_unit=${settings.distanceUnit},timezone=${settings.timezone},onboarded=true,terms_version_accepted=${TERMS_VERSION},terms_accepted_at=NOW() WHERE id=${user.id}`;
        }
      });
      await audit(
        user.id,
        path === "onboarding" ? "onboarding-completed" : "username-changed",
        request,
      );
      return response({ saved: true });
    }
    if (path === "preferences") {
      const values = preferencesSchema.parse(body);
      await sql`INSERT INTO firstrep_user_settings(user_id,preferences) VALUES (${user.id},${sql.json(values)}) ON CONFLICT(user_id) DO UPDATE SET preferences=EXCLUDED.preferences,updated_at=NOW()`;
      await audit(user.id, "preferences-updated", request);
      return response({ saved: true });
    }
    if (path === "passkey-prompt") {
      await sql`UPDATE firstrep_user_settings SET passkey_prompted=true WHERE user_id=${user.id}`;
      return response({ saved: true });
    }
    if (path === "add-password") {
      requireFresh(session);
      const password = passwordSchema.parse(body.password);
      await getAuth().api.setPassword({
        headers: request.headers,
        body: { newPassword: password },
      });
      await audit(user.id, "password-added", request);
      after(() =>
        accountMail(
          user.email,
          "A password was added to FirstRep",
          "A new sign-in method was added. If this wasn’t you, review your security settings.",
          {
            url:
              (process.env.BETTER_AUTH_URL || "http://localhost:3000") +
              "/settings/security",
          },
        ),
      );
      return response({ saved: true });
    }
    if (path === "export") {
      requireFresh(session);
      if (
        (
          await sql`SELECT id FROM firstrep_data_export WHERE user_id=${user.id} AND created_at>NOW()-INTERVAL '1 hour'`
        ).length >= 3
      )
        throw new HttpError(
          "You can request up to three exports per hour.",
          429,
        );
      const jobs =
        await sql`INSERT INTO firstrep_data_export(user_id) VALUES (${user.id}) RETURNING id`;
      await audit(user.id, "data-export-requested", request);
      after(() => runAccountJobs());
      return response({ id: jobs[0].id });
    }
    if (path === "delete") {
      requireFresh(session);
      if (!user.username || body.username !== user.username)
        throw new HttpError("Type your username exactly to confirm.");
      await audit(user.id, "account-deletion-requested", request);
      await sql.begin(async (tx) => {
        await tx`UPDATE "user" SET deleted_at=NOW() WHERE id=${user.id}`;
        await tx`DELETE FROM "session" WHERE user_id=${user.id}`;
        await tx`DELETE FROM firstrep_data_export WHERE user_id=${user.id}`;
      });
      return response({ deleted: true });
    }
    if (path === "restore") {
      requireFresh(session);
      const rows =
        await sql`UPDATE "user" SET deleted_at=NULL WHERE id=${user.id} AND deleted_at>NOW()-INTERVAL '30 days' RETURNING id`;
      if (!rows.length)
        throw new HttpError("The restoration period has ended.", 410);
      await audit(user.id, "account-restored", request);
      return response({ restored: true });
    }
    if (path === "recovery-request") {
      requireFresh(session);
      // This route is reachable only after an email-code login. The auth challenge
      // remains in force for normal app access; recovery approval is separate.
      if (!user.twoFactorEnabled)
        throw new HttpError("Two-factor authentication is not enabled.");
      await sql`INSERT INTO firstrep_recovery_request(user_id) VALUES (${user.id}) ON CONFLICT(user_id) DO UPDATE SET created_at=NOW(),eligible_at=NOW()+INTERVAL '24 hours',cancelled_at=NULL`;
      await audit(user.id, "two-factor-recovery-requested", request);
      after(() =>
        accountMail(
          user.email,
          "FirstRep two-factor recovery requested",
          "There is a 24-hour wait before two-factor recovery can be completed. Cancel from your Security settings if you did not request this.",
          {
            url:
              (process.env.BETTER_AUTH_URL || "http://localhost:3000") +
              "/settings/security",
          },
        ),
      );
      return response({ requested: true });
    }
    if (path === "recovery-cancel") {
      await sql`UPDATE firstrep_recovery_request SET cancelled_at=NOW() WHERE user_id=${user.id}`;
      await audit(user.id, "two-factor-recovery-cancelled", request);
      return response({ cancelled: true });
    }
    if (path === "contact") {
      const data = z
        .object({
          topic: z.enum([
            "Sign-in",
            "Security",
            "Account",
            "Training",
            "AI plans",
            "Billing",
            "Other",
          ]),
          message: z.string().trim().min(10).max(5000),
          screenshot: z
            .string()
            .max(500000)
            .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
            .optional(),
          browser: z.string().max(500),
        })
        .parse(body);
      if (!process.env.SUPPORT_EMAIL)
        throw new HttpError(
          "Support is not available yet. Use the security contact for urgent issues.",
          503,
        );
      await accountMail(
        process.env.SUPPORT_EMAIL,
        `FirstRep support: ${data.topic}`,
        `User: ${user.id}\nReply to: ${user.email}\nApp: 0.1.0\nBrowser: ${data.browser}\n\n${data.message}`,
        { screenshot: data.screenshot },
      );
      return response({ sent: true });
    }
    throw new HttpError("Not found.", 404);
  } catch (error) {
    if (error instanceof HttpError)
      return response({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return response(
        {
          error: error.issues[0].message,
          fields: Object.fromEntries(
            error.issues.map((i) => [i.path.join("."), i.message]),
          ),
        },
        400,
      );
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    )
      return response({ error: "That username is not available." }, 409);
    if (error && typeof error === "object" && "body" in error)
      return response(
        {
          error:
            (error.body as { message?: string })?.message ||
            "Unable to save this change.",
        },
        400,
      );
    return response(
      { error: "Unable to complete this request. Please try again." },
      500,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
