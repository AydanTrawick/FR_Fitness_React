import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
const origin = process.env.AUTH_TEST_BASE_URL || "http://localhost:3025";
test.use({ channel: "chrome" });
test.setTimeout(120000);
// Neon can reset an idle test connection while the browser is starting. Use a
// fresh, short-lived connection for each fixture mutation and for cleanup.
async function fixtureQuery(text, values) {
  let failure;
  for (let attempt = 0; attempt < 3; attempt++) {
    const sql = postgres(process.env.NEON_DATABASE_URL, {
      ssl: "require",
      max: 1,
      connect_timeout: 5,
      connection: { statement_timeout: 10000 },
    });
    try {
      return await sql.unsafe(text, values);
    } catch (error) {
      failure = error;
    } finally {
      await sql.end({ timeout: 1 });
    }
  }
  throw failure;
}
test("normal signup and password login establish a session with the shared guards enabled", async ({
  page,
}) => {
  const email = `firstrep-rate-test-${randomUUID()}@example.invalid`,
    password = `A!7${randomUUID()}z9`;
  const ip = `203.0.113.${10 + Math.floor(Math.random() * 220)}`;
  await page.setExtraHTTPHeaders({ "x-real-ip": ip });
  try {
    const signup = await page.request.post(origin + "/api/auth/sign-up/email", {
      headers: { origin, "x-real-ip": ip },
      data: {
        email,
        password,
        name: "Rate limit auth fixture",
        acceptedTerms: true,
      },
    });
    expect(signup.status()).toBe(200);
    await fixtureQuery(
      'UPDATE "user" SET email_verified=true,onboarded=true WHERE email=$1',
      [email],
    );
    await page.context().clearCookies();
    await page.goto(origin + "/auth?returnTo=%2Fsettings%2Fprofile");
    await page
      .getByRole("status", { name: "Loading FirstRep Fitness" })
      .waitFor({ state: "detached" });
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Password", { exact: true }).fill(password);
    const signIn = page.waitForResponse((response) =>
      response.url().endsWith("/api/auth/sign-in/email"),
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    expect((await signIn).status()).toBe(200);
    await expect(page).toHaveURL(origin + "/settings/profile", {
      timeout: 30000,
    });
    await expect(
      page.getByLabel("Display name", { exact: true }),
    ).toBeVisible();
  } finally {
    await fixtureQuery('DELETE FROM "user" WHERE email=$1 AND name=$2', [
      email,
      "Rate limit auth fixture",
    ]);
  }
});
