import { GENERIC_MAIL_MESSAGE, type RateLimits } from "./core.ts";

// Called before Better Auth is initialized, so limits precede account lookups
// and password hashing. Also used by the acceptance tests with a stub provider.
export async function protectAuthRequest(
  request: Request,
  path: string,
  body: Record<string, unknown>,
  limits: RateLimits,
  handler: () => Promise<Response>,
) {
  const scope =
    request.method === "POST"
      ? await limits.auth(request, path, body)
      : undefined;
  const result = await handler();
  if (scope === "login" && result.ok) {
    const identity =
      typeof body.email === "string" ? body.email : body.username;
    if (typeof identity === "string") await limits.resetLogin(identity);
  }
  if (scope === "reset" || scope === "verify") {
    if (result.status >= 500)
      console.warn("[auth] Account email request failed.");
    // Retain bot/CSRF rejection and throttles; never reveal account existence.
    if (result.status !== 403 && result.status !== 429)
      return Response.json(
        { status: true, message: GENERIC_MAIL_MESSAGE },
        { headers: result.headers },
      );
  }
  if (
    scope === "login" &&
    (path === "/sign-in/email" ||
      path === "/sign-in/email-otp" ||
      path === "/sign-in/username")
  ) {
    const data = await result
      .clone()
      .json()
      .catch(() => ({}));
    if (
      result.status === 401 ||
      [
        "USER_NOT_FOUND",
        "INVALID_PASSWORD",
        "INVALID_EMAIL_OR_PASSWORD",
        "INVALID_USERNAME_OR_PASSWORD",
      ].includes(data.code)
    )
      return Response.json(
        {
          code: "INVALID_EMAIL_OR_PASSWORD",
          message: "Invalid email or password",
        },
        { status: 401, headers: result.headers },
      );
  }
  return result;
}
