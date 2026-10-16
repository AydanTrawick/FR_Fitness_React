import { createHash } from "node:crypto";

export function emailKey(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}
export function userKey(id: string) {
  if (!id) throw new Error("An authenticated user ID is required.");
  return id;
}
// Vercel overwrites x-real-ip at its edge. Forwarded-for is a fallback for
// trusted proxies/local testing; self-hosted deployments must sanitize it.
export function getClientIp(request: Pick<Request, "headers">) {
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
