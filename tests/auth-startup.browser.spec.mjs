import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const origin = process.env.AUTH_TEST_BASE_URL || "http://localhost:3025";
test.use({ channel: "chrome" });
test.setTimeout(90000);

async function enterPassword(page, email, password) {
  await page.goto(origin + "/auth?returnTo=%2Fsettings%2Fprofile");
  await page
    .getByRole("status", { name: "Loading FirstRep Fitness" })
    .waitFor({ state: "detached" });
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("first password sign-in in a fresh browser confirms its session and opens the requested page", async ({
  page,
}) => {
  const sql = postgres(process.env.NEON_DATABASE_URL, {
    ssl: "require",
    max: 1,
    connect_timeout: 10,
  });
  const email = "firstrep-test-" + randomUUID() + "@example.invalid";
  const password = "A!7" + randomUUID() + "z9";
  try {
    const signup = await page.request.post(origin + "/api/auth/sign-up/email", {
      headers: {
        origin,
        "x-forwarded-for": "192.0.2." + (10 + Math.floor(Math.random() * 220)),
      },
      data: {
        email,
        password,
        name: "Startup login fixture",
        acceptedTerms: true,
      },
    });
    expect(signup.ok()).toBe(true);
    await sql`UPDATE "user" SET email_verified=true,onboarded=true WHERE email=${email}`;
    await page.context().clearCookies();
    const confirmed = page.waitForResponse((r) =>
      r.url().includes("/api/auth/get-session?disableCookieCache=true"),
    );
    await enterPassword(page, email, password);
    expect((await confirmed).status()).toBe(200);
    await expect(page).toHaveURL(origin + "/settings/profile", { timeout: 30000 });
    await expect(
      page.getByLabel("Display name", { exact: true }),
    ).toBeVisible({ timeout: 30000 });
  } finally {
    await sql`DELETE FROM "user" WHERE email=${email}`;
    await sql.end({ timeout: 5 });
  }
});

test("a deployment origin error is shown as a configuration failure", async ({
  page,
}) => {
  await page.route("**/api/auth/sign-in/email", (route) =>
    route.fulfill({
      status: 403,
      json: { code: "INVALID_ORIGIN", message: "Invalid origin" },
    }),
  );
  await enterPassword(
    page,
    "startup-fixture@example.invalid",
    "Fixture-only-A7!9",
  );
  await expect(
    page.getByRole("alert").filter({
      hasText: "Sign-in is not configured for this website address",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Email or password is incorrect.", { exact: false }),
  ).toHaveCount(0);
});

test("a successful response without an established session cannot silently leave login stuck", async ({
  page,
}) => {
  await page.route("**/api/auth/sign-in/email", (route) =>
    route.fulfill({
      json: {
        redirect: false,
        token: "fixture-only",
        user: { id: "fixture-user" },
      },
    }),
  );
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({ json: null }),
  );
  await enterPassword(
    page,
    "startup-fixture@example.invalid",
    "Fixture-only-A7!9",
  );
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Your sign-in session could not be confirmed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeEnabled();
});
