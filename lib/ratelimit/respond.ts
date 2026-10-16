import type { RateScope } from "./config.ts";

export class RateLimitError extends Error {
  readonly status = 429;
  readonly reset: number;
  readonly scope: RateScope;
  constructor(reset: number, scope: RateScope) {
    super("Too many attempts.");
    this.reset = reset;
    this.scope = scope;
  }
}
export class GenerationBusyError extends Error {
  readonly status = 409;
  constructor() {
    super(
      "A plan is already being generated. Wait for it to finish, then retry.",
    );
  }
}
export function rateLimitBody(
  reset: number,
  scope: RateScope,
  now = Date.now(),
) {
  const seconds = Math.max(1, Math.ceil((reset - now) / 1000));
  const minutes = Math.ceil(seconds / 60);
  return {
    error: "rate_limited",
    message:
      seconds < 60
        ? `Too many attempts. Try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}.`
        : `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
    retryAfterSeconds: seconds,
    scope,
  };
}
export function tooManyRequests(reset: number, scope: RateScope) {
  const body = rateLimitBody(reset, scope);
  return Response.json(body, {
    status: 429,
    headers: {
      "Retry-After": String(body.retryAfterSeconds),
      "Cache-Control": "no-store",
    },
  });
}
export function rateErrorResponse(error: unknown): Response | undefined {
  if (error instanceof RateLimitError)
    return tooManyRequests(error.reset, error.scope);
  if (error instanceof GenerationBusyError)
    return Response.json(
      { error: error.message },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
}
