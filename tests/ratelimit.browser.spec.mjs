import { test, expect } from "@playwright/test";
const origin = process.env.AUTH_TEST_BASE_URL || "http://localhost:3025";
test.use({ channel: "chrome" });
test.setTimeout(90000);
const blocked = (scope) => ({
  status: 429,
  headers: { "Retry-After": "720" },
  json: {
    error: "rate_limited",
    message: "Too many attempts. Try again in 12 minutes.",
    retryAfterSeconds: 720,
    scope,
  },
});
async function passwordStep(page) {
  await page.goto(origin + "/auth");
  await page
    .getByRole("status", { name: "Loading FirstRep Fitness" })
    .waitFor({ state: "detached" });
  await page
    .getByLabel("Email address", { exact: true })
    .fill("rate-fixture@example.invalid");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}
test("password login displays wait from the 429 response and blocks duplicate submits in flight", async ({
  page,
}) => {
  let calls = 0,
    release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/sign-in/email", async (route) => {
    calls++;
    await pending;
    await route.fulfill(blocked("login"));
  });
  await passwordStep(page);
  await page.getByLabel("Password", { exact: true }).fill("Fixture-only-A7!9");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Signing in…", exact: true }),
  ).toBeDisabled();
  release();
  await expect(
    page.getByRole("alert").filter({ hasText: "Too many attempts" }),
  ).toContainText("Try again in 12 min.");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeEnabled();
  expect(calls).toBe(1);
});
test("password recovery shows the wait without leaking an account lookup", async ({
  page,
}) => {
  await page.route("**/api/auth/request-password-reset", (route) =>
    route.fulfill(blocked("reset")),
  );
  await passwordStep(page);
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Send recovery link", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Too many attempts" }),
  ).toContainText("Try again in 12 min.");
});
