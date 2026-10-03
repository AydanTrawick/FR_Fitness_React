import { serverSession } from "./auth-session";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export { db, HttpError } from "./database";
import { db, HttpError } from "./database";
export type User = { id: string; display_name: string; email: string; role: string; weightUnit?: string; distanceUnit?: string; timezone?: string; };
export async function currentUser(): Promise<User | null> {
  if (!process.env.NEON_DATABASE_URL || !process.env.BETTER_AUTH_SECRET) return null;
  const session = await serverSession();
  if (!session) return null;
  const roles = await db()`SELECT role FROM firstrep_users WHERE id=${session.user.id}`;
  return {id:session.user.id, email:session.user.email, display_name:session.user.name, role:roles[0]?.role || 'customer', weightUnit:session.user.weightUnit, distanceUnit:session.user.distanceUnit, timezone:session.user.timezone};
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new HttpError("Sign in to use this feature.", 401);
  return user;
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new HttpError("This request is not allowed.", 403);
}
const buckets = new Map<string, { count: number; until: number }>();
export function rateLimit(key: string, limit = 30) {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.until < now) buckets.delete(k);
  const bucket = buckets.get(key) ?? { count: 0, until: now + 3600000 };
  if (bucket.count >= limit)
    throw new HttpError("Request limit reached. Try again in an hour.", 429);
  bucket.count++;
  buckets.set(key, bucket);
}
let mailer: ReturnType<typeof nodemailer.createTransport> | undefined;
export async function sendMail(message: {
  to: string;
  subject: string;
  text: string;
}) {
  if (!process.env.EMAIL_ADDRESS || !process.env.EMAIL_PASSWORD)
    throw new HttpError(
      "Email delivery is not connected yet. Add the server’s email configuration to enable it.",
      503,
    );
  mailer ??= nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_ADDRESS,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
  const escaped = message.text.replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!,
  );
  try {
    await mailer.sendMail({
      from: process.env.EMAIL_ADDRESS,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: `<pre style="font-family:inherit;white-space:pre-wrap">${escaped}</pre>`,
    });
  } catch {
    throw new HttpError(
      "The email could not be sent. Try again shortly.",
      502,
    );
  }
}
let bucket: S3Client | undefined;
export function feedbackStorageEnabled() {
  return (
    process.env.STORAGE_BACKEND === "r2" &&
    !!process.env.R2_ACCOUNT_ID &&
    !!process.env.R2_ACCESS_KEY_ID &&
    !!process.env.R2_SECRET_ACCESS_KEY &&
    !!process.env.R2_BUCKET_NAME
  );
}
export async function uploadFeedback(body: unknown) {
  if (!feedbackStorageEnabled())
    throw new HttpError(
      "Feedback storage is not connected yet. Download your feedback instead.",
      503,
    );
  bucket ??= new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  const key = `equipment-feedback/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.json`;
  try {
    await bucket.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: JSON.stringify(body, null, 2),
        ContentType: "application/json",
      }),
    );
  } catch {
    throw new HttpError(
      "The feedback service is unavailable right now. Download your feedback instead.",
      502,
    );
  }
}
export async function providerFetch(url: string, init: RequestInit) {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(60000),
      cache: "no-store",
    });
    if (!res.ok)
      throw new HttpError(
        `The connected service could not complete this request (${res.status}). Check its configuration or try again.`,
        502,
      );
    return res;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(
      "The connected service is unavailable or timed out. Please try again.",
      502,
    );
  }
}
