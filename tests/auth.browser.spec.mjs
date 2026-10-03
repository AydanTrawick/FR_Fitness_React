import { test, expect as baseExpect } from "@playwright/test";
import { generateRandomString } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import JSZip from "jszip";
import { createOTP } from "@better-auth/utils/otp";
const expect = baseExpect.configure({ timeout: 20000 });
const origin = process.env.AUTH_TEST_BASE_URL || "http://localhost:3025";
const mailboxKey =
  process.env.AUTH_TEST_MAILBOX_SECRET || "firstrep-local-tests-only";
test.use({
  channel: "chrome",
  viewport: { width: 1440, height: 1000 },
  extraHTTPHeaders: {
    "x-forwarded-for": "192.0.2." + (10 + Math.floor(Math.random() * 220)),
  },
});
test.setTimeout(300000);
const sql = postgres(process.env.NEON_DATABASE_URL, {
  ssl: "require",
  max: 1,
  onnotice: () => {},
});
const testUsers = [];
test.afterAll(async () => {
  for (const email of testUsers)
    await sql`DELETE FROM "user" WHERE email=${email}`;
  await sql.end();
});
async function mail(page, email, kind = "code") {
  let found;
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          origin + "/api/testing/mailbox?email=" + encodeURIComponent(email),
          { headers: { "x-test-mailbox-key": mailboxKey } },
        );
        const data = await response.json();
        found = data.messages
          ?.filter((m) =>
            kind === "code"
              ? m.code
              : kind === "reset"
                ? m.title === "Reset your FirstRep password"
                : m.title === kind,
          )
          .at(-1);
        return !!found;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  return found;
}
async function authRequest(page, path, body) {
  return page.request.post(origin + "/api/auth/" + path, {
    headers: { origin },
    data: body,
  });
}
async function waitSplash(page) {
  await page
    .getByRole("status", { name: "Loading FirstRep Fitness" })
    .waitFor({ state: "detached", timeout: 10000 });
}
test("verified signup, settings, passkeys, 2FA, reset, privacy, sessions and deletion", async ({
  page,
  context,
}) => {
  const email = "firstrep-test-" + randomUUID() + "@example.invalid";
  testUsers.push(email);
  const password = generateRandomString(32);
  const newPassword = generateRandomString(32);
  const handle = "rep_" + randomUUID().slice(0, 8);
  const browserErrors = [];
  page.on("pageerror", (e) => browserErrors.push(e.message));
  await page.goto(origin + "/");
  await expect(page).toHaveURL(/\/auth/);
  await waitSplash(page);
  await page.screenshot({ path: "test-results/auth-desktop.png" });
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page
    .getByLabel("Display name", { exact: true })
    .fill("FirstRep test athlete");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Check your inbox." }),
  ).toBeVisible({ timeout: 20000 });
  expect(
    (await authRequest(page, "sign-in/email", { email, password })).status(),
  ).toBe(403);
  const verification = await mail(page, email);
  await page
    .getByLabel("Verification code", { exact: true })
    .fill(verification.code);
  await page
    .getByRole("button", { name: "Continue securely", exact: true })
    .click();
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 20000 });
  await waitSplash(page);
  await page.getByRole("button", { name: "Maybe later" }).click();
  await page.getByLabel("Pick your username").fill(handle);
  await expect(page.getByText("Available", { exact: true })).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Let’s get started" }).click();
  await expect(page).toHaveURL(origin + "/");
  await waitSplash(page);
  expect(
    (
      await sql`SELECT terms_version_accepted,onboarded FROM "user" WHERE email=${email}`
    )[0].onboarded,
  ).toBe(true);
  const id = (await sql`SELECT id FROM "user" WHERE email=${email}`)[0].id;
  // Settings changes persist, start private, and require an actual changed field.
  await page.goto(origin + "/settings/profile");
  await expect(page.getByLabel("Display name", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
  await page.getByLabel("Bio", { exact: true }).fill("Working on consistency.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Profile saved." }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Bio", { exact: true })).toHaveValue(
    "Working on consistency.",
  );
  await page.screenshot({
    path: "test-results/settings-profile-desktop.png",
    fullPage: true,
  });
  // Enroll a passkey with a virtual WebAuthn authenticator.
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.goto(origin + "/settings/security");
  await page
    .getByRole("button", { name: "Add a passkey", exact: true })
    .click();
  await expect(page.getByLabel("Passkey name")).toBeVisible({ timeout: 15000 });
  await page.getByLabel("Confirm your current password").fill(password);
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  await expect(
    page.getByAltText("Scan this QR code in your authenticator app"),
  ).toBeVisible();
  // Read only the disposable test account's encrypted secret with the library.
  const { symmetricDecrypt } = await import("better-auth/crypto");
  const secretRow = (
    await sql`SELECT secret FROM two_factor WHERE user_id=${id}`
  )[0];
  const secret = await symmetricDecrypt({
    key: process.env.BETTER_AUTH_SECRET,
    data: secretRow.secret,
  });
  const otp = () => createOTP(secret, { digits: 6, period: 30 }).totp();
  await page
    .getByLabel("Authenticator code", { exact: true })
    .fill(await otp());
  await page
    .getByRole("button", { name: "Verify authenticator", exact: true })
    .click();
  await expect(page.getByText("Enabled", { exact: true })).toBeVisible();
  const codes = await page.locator(".backup-codes span").allTextContents();
  expect(codes.length).toBe(10);
  await page.screenshot({
    path: "test-results/settings-security-desktop.png",
    fullPage: true,
    mask: [page.locator(".backup-codes")],
  });
  // Sign out and prove a password alone cannot reach private records.
  await authRequest(page, "sign-out", {});
  const first = await authRequest(page, "sign-in/email", { email, password });
  expect(first.ok()).toBe(true);
  expect((await first.json()).twoFactorRedirect).toBe(true);
  expect((await page.request.get(origin + "/api/account")).status()).toBe(401);
  const second = await authRequest(page, "two-factor/verify-totp", {
    code: await otp(),
  });
  expect(second.ok()).toBe(true);
  expect((await page.request.get(origin + "/api/account")).status()).toBe(200);
  // Backup codes work once.
  await authRequest(page, "sign-out", {});
  await authRequest(page, "sign-in/email", { email, password });
  expect(
    (
      await authRequest(page, "two-factor/verify-backup-code", {
        code: codes[0],
      })
    ).ok(),
  ).toBe(true);
  await authRequest(page, "sign-out", {});
  await authRequest(page, "sign-in/email", { email, password });
  expect(
    (
      await authRequest(page, "two-factor/verify-backup-code", {
        code: codes[0],
      })
    ).ok(),
  ).toBe(false);
  expect(
    (
      await authRequest(page, "two-factor/verify-totp", { code: await otp() })
    ).ok(),
  ).toBe(true);
  // Email code sign-in is also challenged for 2FA.
  await authRequest(page, "sign-out", {});
  await authRequest(page, "email-otp/send-verification-otp", {
    email,
    type: "sign-in",
  });
  const signinCode = await mail(page, email);
  const emailLogin = await authRequest(page, "sign-in/email-otp", {
    email,
    otp: signinCode.code,
  });
  expect((await emailLogin.json()).twoFactorRedirect).toBe(true);
  expect((await page.request.get(origin + "/api/account")).status()).toBe(401);
  expect(
    (
      await authRequest(page, "two-factor/verify-totp", { code: await otp() })
    ).ok(),
  ).toBe(true);
  // Password recovery is single-use, requires a second factor, and revokes sessions.
  await authRequest(page, "request-password-reset", {
    email,
    redirectTo: "/auth?step=new-password",
  });
  const reset = await mail(page, email, "reset");
  const token = new URL(reset.url).pathname.split("/").at(-1);
  expect(
    (await authRequest(page, "reset-password", { token, newPassword })).ok(),
  ).toBe(true);
  expect(
    (
      await authRequest(page, "reset-password", {
        token,
        newPassword: password,
      })
    ).ok(),
  ).toBe(false);
  expect((await page.request.get(origin + "/api/account")).status()).toBe(401);
  // Passkeys sign in without a TOTP challenge.
  await page.goto(origin + "/auth");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page).toHaveURL(origin + "/", { timeout: 20000 });
  // Privacy and export cover stored user data, without credentials.
  await sql`INSERT INTO firstrep_workout_entries(user_id,exercise,sets,reps,weight_kg,rpe) VALUES (${id},'FirstRep test squat',3,8,60,7)`;
  await sql`INSERT INTO firstrep_food_entries(user_id,food,protein_g,carbs_g,fat_g) VALUES (${id},'FirstRep test meal',30,40,15)`;
  await page.goto(origin + "/settings/privacy");
  await expect(page.getByLabel("Profile visibility")).toHaveValue("private");
  await expect(
    page.getByRole("switch", { name: "Use my history for AI features" }),
  ).toHaveAttribute("aria-checked", "false");
  const exported = await page.request.post(origin + "/api/account/export", {
    headers: { origin },
    data: {},
  });
  expect(exported.ok()).toBe(true);
  const exportId = (await exported.json()).id;
  await expect
    .poll(
      async () => {
        const rows =
          await sql`SELECT status FROM firstrep_data_export WHERE id=${exportId}`;
        return rows[0]?.status;
      },
      { timeout: 15000 },
    )
    .toBe("ready");
  const file = await page.request.get(
    origin + "/api/account/export/" + exportId,
  );
  expect(file.ok()).toBe(true);
  const zip = await JSZip.loadAsync(await file.body());
  expect(zip.file("firstrep.json")).toBeTruthy();
  const contents = await zip.file("firstrep.json").async("string");
  expect(contents.includes("FirstRep test squat")).toBe(true);
  expect(contents.includes("FirstRep test meal")).toBe(true);
  expect(contents.includes("password_hash")).toBe(false);
  expect(contents.includes("backup_codes")).toBe(false);
  // An older session must re-confirm identity for sensitive actions.
  const active = (
    await sql`SELECT id FROM "session" WHERE user_id=${id} ORDER BY created_at DESC LIMIT 1`
  )[0];
  await sql`UPDATE "session" SET created_at=NOW()-INTERVAL '11 minutes' WHERE id=${active.id}`;
  expect(
    (
      await page.request.post(origin + "/api/account/export", {
        headers: { origin },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await sql`UPDATE "session" SET created_at=NOW() WHERE id=${active.id}`;
  // Every settings route fits on a phone and remains usable from the keyboard.
  await page.setViewportSize({ width: 375, height: 812 });
  for (const section of [
    "profile",
    "username",
    "email",
    "password",
    "security",
    "connected-accounts",
    "sessions",
    "activity",
    "notifications",
    "privacy",
    "help",
  ]) {
    await page.goto(origin + "/settings/" + section);
    await expect(page.locator(".settings-card").first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto(origin + "/settings/profile");
  await expect(page.getByLabel("Display name", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/settings-mobile.png",
    fullPage: true,
  });
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => document.activeElement !== document.body),
  ).toBe(true);
  // Deletion blocks all private access immediately, then can be restored.
  const deletion = await page.request.post(origin + "/api/account/delete", {
    headers: { origin },
    data: { username: handle },
  });
  expect(deletion.ok()).toBe(true);
  expect((await page.request.get(origin + "/api/account")).status()).toBe(401);
  await page.goto(origin + "/auth");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page).toHaveURL(/\/auth\/restore/, { timeout: 20000 });
  await page.getByRole("button", { name: "Restore my account" }).click();
  await expect(page).toHaveURL(origin + "/");
  expect(
    (await sql`SELECT deleted_at FROM "user" WHERE id=${id}`)[0].deleted_at,
  ).toBe(null);
  expect(browserErrors).toEqual([]);
  await sql`DELETE FROM "user" WHERE id=${id}`;
  expect(
    (await sql`SELECT id FROM firstrep_workout_entries WHERE user_id=${id}`)
      .length,
  ).toBe(0);
  expect(
    (await sql`SELECT id FROM firstrep_food_entries WHERE user_id=${id}`)
      .length,
  ).toBe(0);
});
test("unknown emails, invalid redirects and rate limits", async ({ page }) => {
  const email = "firstrep-test-" + randomUUID() + "@example.invalid";
  await page.goto(origin + "/auth?returnTo=https://foreign.example/");
  const requests = [];
  for (let i = 0; i < 6; i++)
    requests.push(
      (
        await authRequest(page, "sign-in/email", {
          email,
          password: generateRandomString(24),
        })
      ).status(),
    );
  expect(requests[5]).toBe(429);
  const unknown = await authRequest(page, "email-otp/send-verification-otp", {
    email,
    type: "sign-in",
  });
  expect(unknown.ok()).toBe(true);
  expect((await unknown.json()).message).toBe(
    "If an account exists, we sent a code.",
  );
  expect(
    (
      await page.request.get(origin + "/settings/profile", { maxRedirects: 0 })
    ).status(),
  ).toBe(307);
  const cross = await page.request.post(origin + "/api/auth/sign-up/email", {
    headers: { origin: "https://foreign.example" },
    data: {
      email,
      password: generateRandomString(24),
      name: "Other",
      acceptedTerms: true,
    },
  });
  expect(cross.status()).toBe(403);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: "test-results/auth-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
