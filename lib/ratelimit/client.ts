import type { RateScope } from "./config.ts";
type ErrorData = {
  error?: string;
  message?: string;
  retryAfterSeconds?: number;
  scope?: RateScope;
  ttsLimited?: boolean;
};
export const AUDIO_PAUSED_MESSAGE =
  "Audio is paused for today. Your text replies are still available.";
export function rateLimitMessage(data: ErrorData) {
  const seconds = Math.max(1, Number(data.retryAfterSeconds) || 60);
  const wait =
    seconds < 60
      ? `${Math.ceil(seconds)} sec`
      : `${Math.ceil(seconds / 60)} min`;
  const message =
    data.scope === "plan_builder"
      ? "You've used your plan generations for now."
      : data.scope === "voice"
        ? "Your assistant has reached its request limit."
        : "Too many attempts. Please wait.";
  return `${message} Try again in ${wait}.`;
}
export function requestError(
  response: Pick<Response, "status">,
  data: ErrorData,
) {
  if (response.status === 429) return new Error(rateLimitMessage(data));
  if (data.ttsLimited) return new Error(AUDIO_PAUSED_MESSAGE);
  return new Error(
    data.message || data.error || "The request could not be completed.",
  );
}
