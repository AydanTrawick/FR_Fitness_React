import { accountMail } from "./mail";
import { db } from "@/lib/database";
import { generateRandomString } from "better-auth/crypto";
import { after } from "next/server";
export function background(task: Promise<unknown>) {
  const safe = task.catch(() => {});
  try {
    after(() => safe);
  } catch {
    void safe;
  }
}
export async function emailUndo(
  userId: string,
  oldEmail: string,
  newEmail: string,
): Promise<void> {
  const rows =
    await db()`INSERT INTO firstrep_email_history(user_id,old_email,new_email) VALUES (${userId},${oldEmail},${newEmail}) RETURNING id`;
  const { auth } = await import("@/lib/auth");
  const token = generateRandomString(32);
  const context = await auth.$context;
  // Better Auth handles random generation, hashed identifiers, expiry and
  // atomic consumption. Undo survives sign-out and session revocation.
  await context.internalAdapter.createVerificationValue({
    identifier: "firstrep-email-undo:" + token,
    value: JSON.stringify({ userId, changeId: rows[0].id }),
    expiresAt: new Date(Date.now() + 24 * 3600000),
  });
  const url =
    (process.env.BETTER_AUTH_URL || "http://localhost:3000") +
    "/auth/undo-email?change=" +
    rows[0].id +
    "&token=" +
    encodeURIComponent(token);
  await accountMail(
    oldEmail,
    "Your FirstRep email was changed",
    "If you did not make this change, use this single-use undo link within 24 hours. It will restore your previous email and sign out every device.",
    { url },
  );
}
