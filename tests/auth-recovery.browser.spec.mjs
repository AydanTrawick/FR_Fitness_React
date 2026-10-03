import { test, expect } from "@playwright/test";
import { generateRandomString, symmetricDecrypt } from "better-auth/crypto";
import { createOTP } from "@better-auth/utils/otp";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
const origin = process.env.AUTH_TEST_BASE_URL || "http://localhost:3025";
test.setTimeout(240000);
test("verified email change can be undone once; lost 2FA requires email proof and a 24-hour wait", async ({
  playwright,
}) => {
  const request = await playwright.request.newContext({
    extraHTTPHeaders: {
      origin,
      "x-forwarded-for": "192.0.2." + (10 + Math.floor(Math.random() * 220)),
    },
  });
  const sql = postgres(process.env.NEON_DATABASE_URL, {
    ssl: "require",
    max: 1,
  });
  const email = "firstrep-test-" + randomUUID() + "@example.invalid",
    newEmail = "firstrep-test-" + randomUUID() + "@example.invalid",
    password = generateRandomString(32);
  const post = (path, body) =>
    test.step("auth: " + path, () =>
      request.post(origin + "/api/auth/" + path, {
        data: body,
        timeout: 30000,
      }),
    );
  async function mail(to, title) {
    let found;
    await expect
      .poll(
        async () => {
          const response = await request.get(
            origin + "/api/testing/mailbox?email=" + encodeURIComponent(to),
            {
              headers: {
                "x-test-mailbox-key":
                  process.env.AUTH_TEST_MAILBOX_SECRET ||
                  "firstrep-local-tests-only",
              },
            },
          );
          found = (await response.json()).messages
            ?.filter((m) => (title ? m.title === title : !!m.code))
            .at(-1);
          return !!found;
        },
        { timeout: 20000 },
      )
      .toBe(true);
    return found;
  }
  try {
    expect(
      (
        await post("sign-up/email", {
          email,
          password,
          name: "Recovery test",
          acceptedTerms: true,
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await post("email-otp/verify-email", {
          email,
          otp: (await mail(email)).code,
        })
      ).ok(),
    ).toBe(true);
    const id = (await sql`SELECT id FROM "user" WHERE email=${email}`)[0].id;
    expect(
      (
        await post("email-otp/send-verification-otp", {
          email,
          type: "email-verification",
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await post("email-otp/request-email-change", {
          newEmail,
          otp: (await mail(email)).code,
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await post("email-otp/change-email", {
          newEmail,
          otp: (await mail(newEmail)).code,
        })
      ).ok(),
    ).toBe(true);
    expect((await sql`SELECT email FROM "user" WHERE id=${id}`)[0].email).toBe(
      newEmail,
    );
    await post("sign-out", {});
    const undo = await mail(email, "Your FirstRep email was changed");
    const link = new URL(undo.url);
    const undoBody = {
      token: link.searchParams.get("token"),
      change: link.searchParams.get("change"),
    };
    expect(
      (
        await request.post(origin + "/api/account-email-undo", {
          data: undoBody,
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await request.post(origin + "/api/account-email-undo", {
          data: undoBody,
        })
      ).ok(),
    ).toBe(false);
    expect((await request.get(origin + "/api/account")).status()).toBe(401);
    expect((await post("sign-in/email", { email, password })).ok()).toBe(true);
    expect((await post("two-factor/enable", { password })).ok()).toBe(true);
    const encrypted = (
      await sql`SELECT secret FROM two_factor WHERE user_id=${id}`
    )[0].secret;
    const secret = await symmetricDecrypt({
      key: process.env.BETTER_AUTH_SECRET,
      data: encrypted,
    });
    expect(
      (
        await post("two-factor/verify-totp", {
          code: await createOTP(secret, { digits: 6, period: 30 }).totp(),
        })
      ).ok(),
    ).toBe(true);
    await post("sign-out", {});
    expect(
      (
        await post("email-otp/send-verification-otp", {
          email,
          type: "sign-in",
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await request.post(origin + "/api/recovery/start", {
          data: { email, otp: (await mail(email)).code },
        })
      ).ok(),
    ).toBe(true);
    expect((await request.get(origin + "/api/account")).status()).toBe(401);
    const waiting = (
      await sql`SELECT eligible_at FROM firstrep_recovery_request WHERE user_id=${id}`
    )[0];
    expect(
      new Date(waiting.eligible_at).getTime() - Date.now(),
    ).toBeGreaterThan(23 * 3600000);
    expect(
      (
        await request.post(origin + "/api/recovery/finish", {
          data: { email, otp: "000000" },
        })
      ).ok(),
    ).toBe(false);
    // Advance only this disposable account's waiting period, never a real user's.
    await sql`UPDATE firstrep_recovery_request SET eligible_at=NOW()-INTERVAL '1 minute' WHERE user_id=${id}`;
    expect(
      (
        await post("email-otp/send-verification-otp", {
          email,
          type: "sign-in",
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await request.post(origin + "/api/recovery/finish", {
          data: { email, otp: (await mail(email)).code },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (await sql`SELECT two_factor_enabled FROM "user" WHERE id=${id}`)[0]
        .two_factor_enabled,
    ).toBe(false);
    expect(
      (await sql`SELECT id FROM two_factor WHERE user_id=${id}`).length,
    ).toBe(0);
    expect(
      (await sql`SELECT id FROM "session" WHERE user_id=${id}`).length,
    ).toBe(0);
  } finally {
    await sql`DELETE FROM "user" WHERE email IN (${email},${newEmail})`;
    await sql.end();
    await request.dispose();
  }
});
