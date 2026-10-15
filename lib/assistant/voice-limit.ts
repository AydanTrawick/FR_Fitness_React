import { sharedRateStorage } from "../auth/rate-storage";
import { HttpError } from "../database";
export async function limitVoice(userId: string, kind: string) {
  const result = await sharedRateStorage.consume(
    `assistant-${kind}:${userId}`,
    { window: 60, max: 30 },
  );
  if (!result.allowed)
    throw new HttpError(
      "Voice request limit reached. Try again in a minute or use text chat.",
      429,
    );
}
