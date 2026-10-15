import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
// Stateless, authenticated, short-lived URL for native streaming playback on
// browsers without MP3 MediaSource. Text is encrypted, not placed in query logs.
const key = (secret: string) =>
  createHash("sha256")
    .update("firstrep-speech:" + secret)
    .digest();
export function speechTicket(
  userId: string,
  text: string,
  secret: string,
  now = Date.now(),
) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(
      JSON.stringify({ userId, text, expires: now + 90000 }),
      "utf8",
    ),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}
export function readSpeechTicket(
  ticket: string,
  userId: string,
  secret: string,
  now = Date.now(),
): string {
  if (ticket.length > 12000) throw new Error("Invalid speech ticket");
  const bytes = Buffer.from(ticket, "base64url"),
    decipher = createDecipheriv(
      "aes-256-gcm",
      key(secret),
      bytes.subarray(0, 12),
    );
  decipher.setAuthTag(bytes.subarray(12, 28));
  const data = JSON.parse(
    Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]).toString("utf8"),
  );
  if (
    data.userId !== userId ||
    typeof data.expires !== "number" ||
    data.expires <= now ||
    typeof data.text !== "string" ||
    !data.text ||
    data.text.length > 1200
  )
    throw new Error("Expired or invalid speech ticket");
  return data.text;
}
