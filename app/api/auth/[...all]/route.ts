import { authRequestOrigins, getAuthURL } from "@/lib/auth/origin";
import { getAuth } from "@/lib/auth";
import { limits } from "@/lib/ratelimit/limiters";
import { protectAuthRequest } from "@/lib/ratelimit/auth";
import { rateErrorResponse, tooManyRequests } from "@/lib/ratelimit/respond";
import { authPolicy } from "@/lib/ratelimit/core";
import { db, HttpError } from "@/lib/database";
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
  const origin = request.headers.get("origin");
  if (origin && !authRequestOrigins(request).includes(origin))
    return Response.json(
      {
        code: "INVALID_ORIGIN",
        message:
          "This website address is not configured for sign-in. Open the main FirstRep website, or ask the app owner to update the allowed website URLs.",
      },
      { status: 403 },
    );
  const path = new URL(request.url).pathname.replace("/api/auth", "");
  const parsed =
    request.method === "POST"
      ? await request
          .clone()
          .json()
          .catch(() => ({}))
      : {};
  const body =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  // Never log request bodies, cookies, response credentials, or email codes.
  const started = Date.now();
  let result: Response;
  try {
    result = await protectAuthRequest(request, path, body, limits, () =>
      getAuth().handler(request),
    );
  } catch (error) {
    const response = rateErrorResponse(error);
    if (response) return response;
    if (error instanceof HttpError)
      return Response.json(
        { message: error.message },
        { status: error.status },
      );
    throw error;
  }
  if (result.status === 429) {
    const seconds = Math.max(
      1,
      Number(result.headers.get("Retry-After")) || 60,
    );
    return tooManyRequests(
      Date.now() + seconds * 1000,
      authPolicy(path, body) ?? "login",
    );
  }
  if (mailPaths.has(path) || path === "/sign-up/email")
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, 1200 - (Date.now() - started))),
    );
  if (path === "/sign-in/email" && email) {
    try {
      if (result.status === 401) {
        const failed =
          await db()`INSERT INTO firstrep_auth_failures(email,count) VALUES (${email},1) ON CONFLICT(email) DO UPDATE SET count=CASE WHEN firstrep_auth_failures.updated_at < NOW()-INTERVAL '1 hour' THEN 1 ELSE firstrep_auth_failures.count+1 END,updated_at=NOW(),blocked_until=NULL RETURNING count`;
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
                  url: getAuthURL() + "/settings/security",
                },
              ).catch(() => {});
          });
      } else if (result.ok)
        await db()`DELETE FROM firstrep_auth_failures WHERE email=${email}`;
    } catch {
      console.warn("[auth] Sign-in failure tracking unavailable.");
    }
  }
  return result;
}
export const GET = handle;
export const POST = handle;
