import { rateLimitMessage } from "../ratelimit/client.ts";
type LoginError = {
  code?: string;
  status?: number;
  message?: string;
  retryAfterSeconds?: number;
};

export function loginErrorMessage(error: LoginError) {
  if (error.code === "INVALID_ORIGIN")
    return "Sign-in is not configured for this website address. The app owner needs to update the allowed website URL and redeploy.";
  if (error.status === 429)
    return rateLimitMessage({ ...error, scope: "login" });
  if (error.status && error.status >= 500)
    return "The sign-in service is temporarily unavailable. Please try again shortly.";
  return "Email or password is incorrect. You can also use an email code.";
}
