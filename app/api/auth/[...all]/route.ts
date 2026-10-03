import { getAuth } from "@/lib/auth";
import { sharedRateStorage } from "@/lib/auth/rate-storage";
import { db } from "@/lib/database";
import { after } from "next/server";
import { accountMail } from "@/lib/auth/mail";
export const runtime = "nodejs";
const mailPaths = new Set([
  "/email-otp/send-verification-otp",
  "/request-password-reset",
  "/email-otp/request-password-reset",
  "/send-verification-email",
]);
async function handle(request: Request) {
  if (!process.env.BETTER_AUTH_SECRET || !process.env.NEON_DATABASE_URL)
    return Response.json(
      {
        message:
          "Account sign-in is being configured. Please try again shortly.",
      },
      { status: 503 },
    );
  const path = new URL(request.url).pathname.replace("/api/auth", "");
  const body =
    request.method === "POST"
      ? await request
          .clone()
          .json()
          .catch(() => ({}))
      : {};
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email && (mailPaths.has(path) || path.startsWith("/sign-in/"))) {
    const limit = await sharedRateStorage.consume(
      "email:" + path + ":" + email,
      {
        window: mailPaths.has(path) ? 3600 : 60,
        max: mailPaths.has(path) ? 3 : 5,
      },
    );
    if (!limit.allowed)
      return Response.json(
        { message: "Too many attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
  }
  if (path === "/sign-in/email" && email) {
    const rows =
      await db()`SELECT blocked_until FROM firstrep_auth_failures WHERE email=${email}`;
    if (
      rows[0]?.blocked_until &&
      new Date(rows[0].blocked_until).getTime() > Date.now()
    )
      return Response.json(
        {
          message:
            "Unable to sign in. Please try again later or use account recovery.",
        },
        { status: 429 },
      );
  }
  // Never log request bodies, cookies, response credentials, or email codes.
  const started = Date.now();
  const result = await getAuth().handler(request);
  if (mailPaths.has(path) || path === "/sign-up/email")
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, 1200 - (Date.now() - started))),
    );
  if (path === "/sign-in/email" && email) {
    if (result.status === 401) {
      const failed =
        await db()`INSERT INTO firstrep_auth_failures(email,count) VALUES (${email},1) ON CONFLICT(email) DO UPDATE SET count=CASE WHEN firstrep_auth_failures.updated_at < NOW()-INTERVAL '1 hour' THEN 1 ELSE firstrep_auth_failures.count+1 END,updated_at=NOW(),blocked_until=CASE WHEN firstrep_auth_failures.count>=9 THEN NOW()+LEAST(900,POWER(2,LEAST(firstrep_auth_failures.count-8,9))) * INTERVAL '1 second' ELSE NULL END RETURNING count`;
      if (failed[0].count === 10)
        after(async () => {
          const user =
            await db()`SELECT email FROM "user" WHERE email=${email} AND deleted_at IS NULL`;
          if (user[0])
            await accountMail(
              email,
              "Unusual FirstRep sign-in attempts",
              "We noticed several unsuccessful sign-in attempts. No permanent lock was applied. Review your devices or reset your password.",
              {
                url:
                  (process.env.BETTER_AUTH_URL || "http://localhost:3000") +
                  "/settings/security",
              },
            ).catch(() => {});
        });
    } else if (result.ok)
      await db()`DELETE FROM firstrep_auth_failures WHERE email=${email}`;
  }
  if (
    mailPaths.has(path) &&
    result.status !== 429 &&
    result.status !== 403 &&
    result.status < 500
  )
    return Response.json(
      { status: true, message: "If an account exists, we sent a code." },
      { headers: result.headers },
    );
  return result;
}
export const GET = handle;
export const POST = handle;
