import { createHmac, timingSafeEqual } from "node:crypto";
export const PHOTO_TTL_SECONDS = 600;
export function signPhoto(
  secret: string,
  userId: string,
  photoId: string,
  expires: number,
) {
  return createHmac("sha256", secret)
    .update(JSON.stringify([userId, photoId, expires]))
    .digest("hex");
}
export function verifyPhoto(
  secret: string,
  userId: string,
  photoId: string,
  expires: number,
  signature: string,
  now = Math.floor(Date.now() / 1000),
) {
  if (
    !Number.isSafeInteger(expires) ||
    expires <= now ||
    expires > now + PHOTO_TTL_SECONDS ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(signPhoto(secret, userId, photoId, expires), "hex"),
    Buffer.from(signature, "hex"),
  );
}
