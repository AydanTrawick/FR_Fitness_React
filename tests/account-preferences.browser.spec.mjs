import { test, expect as baseExpect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { createAction, changeAction } from "../lib/assistant/actions.ts";
const expect = baseExpect.configure({ timeout: 30000 });
const origin = process.env.AUTH_TEST_BASE_URL || "http://localhost:3025";
test.use({ channel: "chrome", viewport: { width: 1280, height: 900 } });
test.setTimeout(180000);
test("privacy preferences save after Better Auth initializes the shared database client", async ({
  page,
}) => {
  const sql = postgres(process.env.NEON_DATABASE_URL, {
    ssl: "require",
    max: 1,
  });
  const email = "firstrep-test-" + randomUUID() + "@example.invalid";
  const password = "Fr!" + randomUUID();
  const post = (path, data) =>
    page.request.post(origin + "/api/" + path, { headers: { origin }, data });
  try {
    const signup = await post("auth/sign-up/email", {
      email,
      password,
      name: "Privacy regression fixture",
      acceptedTerms: true,
    });
    expect(signup.status()).toBe(200);
    // Test-only account verification. The local test server captures emails.
    await sql`UPDATE "user" SET email_verified=true,onboarded=true WHERE email=${email}`;
    const signin = await post("auth/sign-in/email", { email, password });
    expect(signin.status()).toBe(200);
    await page.addInitScript(() =>
      sessionStorage.setItem("firstrep-splash-seen", "1"),
    );
    await page.goto(origin + "/settings/privacy", {
      waitUntil: "domcontentloaded",
    });
    const ai = page.getByRole("switch", {
      name: "Use my history for AI features",
    });
    const analytics = page.getByRole("switch", { name: "Product analytics" });
    await expect(ai).toHaveAttribute("aria-checked", "false");
    await ai.click();
    await analytics.click();
    await page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Preferences saved." }),
    ).toBeVisible();
    await page.reload();
    await expect(ai).toHaveAttribute("aria-checked", "true");
    await expect(analytics).toHaveAttribute("aria-checked", "true");
    let consent = await page.request.get(
      origin + "/api/account/analytics-consent",
    );
    expect((await consent.json()).optIn).toBe(true);
    const [settings] =
      await sql`SELECT s.user_id,s.preferences FROM firstrep_user_settings s JOIN "user" u ON u.id=s.user_id WHERE u.email=${email}`;
    expect(settings.preferences.aiDataOptIn).toBe(true);
    expect(settings.preferences.analyticsOptIn).toBe(true);
    await ai.click();
    await analytics.click();
    await page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Preferences saved." }),
    ).toBeVisible();
    consent = await page.request.get(origin + "/api/account/analytics-consent");
    expect((await consent.json()).optIn).toBe(false);
    await page.reload();
    await expect(ai).toHaveAttribute("aria-checked", "false");
    await expect(analytics).toHaveAttribute("aria-checked", "false");
    // Reproduce the adapter's serializer mutation on a real postgres client.
    // Both creating and confirming assistant drafts used the same broken helper.
    drizzle(sql);
    const actor = {
      id: settings.user_id,
      weightUnit: "lb",
      timezone: "America/New_York",
    };
    const conversation = randomUUID();
    const draft = await createAction(
      actor,
      conversation,
      "privacy-regression-" + randomUUID(),
      "workout_set",
      {
        exercise_name: "Privacy regression test lift",
        custom: true,
        sets: [{ weight: 225, reps: 10, unit: "lb" }],
      },
      sql,
    );
    expect(draft.payload.sets[0].weight).toBe(225);
    const saved = await changeAction(
      actor,
      draft.id,
      conversation,
      "confirm",
      undefined,
      sql,
    );
    expect(saved.status).toBe("confirmed");
    const [confirmed] =
      await sql`SELECT payload FROM pending_log_actions WHERE id=${draft.id}`;
    expect(confirmed.payload.sets[0].reps).toBe(10);
    const bad = await page.request.post(origin + "/api/account/preferences", {
      headers: { origin: "https://untrusted.example" },
      data: settings.preferences,
    });
    expect(bad.status()).toBe(403);
  } finally {
    await sql`DELETE FROM "user" WHERE email=${email}`;
    await sql.end();
  }
});
