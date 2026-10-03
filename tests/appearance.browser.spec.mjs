import { test, expect } from "@playwright/test";
import { generateRandomString } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
const origin = process.env.AUTH_TEST_BASE_URL || "http://localhost:3025";
test.use({ channel: "chrome", viewport: { width: 1440, height: 1000 } });
test.setTimeout(180000);
test("Ink logo, clean dashboard and feet/inches conversion on desktop and phone", async ({
  page,
}) => {
  const sql = postgres(process.env.NEON_DATABASE_URL, {
    ssl: "require",
    max: 1,
  });
  const email = "firstrep-test-" + randomUUID() + "@example.invalid";
  try {
    const signup = await page.request.post(origin + "/api/auth/sign-up/email", {
      headers: {
        origin,
        "x-forwarded-for": "192.0.2." + (10 + Math.floor(Math.random() * 220)),
      },
      data: {
        email,
        password: generateRandomString(32),
        name: "Appearance test",
        acceptedTerms: true,
      },
    });
    expect(signup.ok()).toBe(true);
    let code;
    await expect
      .poll(
        async () => {
          const response = await page.request.get(
            origin + "/api/testing/mailbox?email=" + encodeURIComponent(email),
            { headers: { "x-test-mailbox-key": "firstrep-local-tests-only" } },
          );
          code = (await response.json()).messages
            ?.filter((m) => m.code)
            .at(-1)?.code;
          return !!code;
        },
        { timeout: 20000 },
      )
      .toBe(true);
    expect(
      (
        await page.request.post(origin + "/api/auth/email-otp/verify-email", {
          headers: { origin },
          data: { email, otp: code },
        })
      ).ok(),
    ).toBe(true);
    const id = (
      await sql`UPDATE "user" SET onboarded=true WHERE email=${email} RETURNING id`
    )[0].id;
    await page.goto(origin + "/");
    await page
      .getByRole("status", { name: "Loading FirstRep Fitness" })
      .waitFor({ state: "detached", timeout: 15000 });
    await expect(page.locator(".hero-emblem .rep-one-logo")).toBeVisible({
      timeout: 20000,
    });
    expect(await page.locator(".hero .art-tag").count()).toBe(0);
    await expect(page.locator(".brand .rep-one-logo")).toBeVisible();
    await page.screenshot({
      path: "test-results/dashboard-ink.png",
      fullPage: true,
    });
    await page.goto(origin + "/#bmi");
    await page.getByRole("button", { name: "Imperial", exact: true }).click();
    await page.getByRole("spinbutton", { name: "Feet", exact: true }).fill("5");
    await page
      .getByRole("spinbutton", { name: "Inches", exact: true })
      .fill("11");
    await page.getByRole("checkbox", { name: "I am 20 or older." }).check();
    await page
      .getByRole("button", { name: "Calculate & save reading" })
      .click();
    await expect
      .poll(
        async () =>
          Number(
            (
              await sql`SELECT height_cm FROM firstrep_bmi_readings WHERE user_id=${id} ORDER BY created_at DESC LIMIT 1`
            )[0]?.height_cm,
          ),
        { timeout: 15000 },
      )
      .toBeCloseTo(180.34, 2);
    await page.getByRole("button", { name: "Metric", exact: true }).click();
    await expect(
      page.getByRole("spinbutton", { name: "Height (cm)", exact: true }),
    ).toHaveValue("180.34");
    await page.getByRole("button", { name: "Imperial", exact: true }).click();
    await expect(
      page.getByRole("spinbutton", { name: "Feet", exact: true }),
    ).toHaveValue("5");
    await expect(
      page.getByRole("spinbutton", { name: "Inches", exact: true }),
    ).toHaveValue("11");
    await page
      .getByRole("spinbutton", { name: "Inches", exact: true })
      .fill("12");
    expect(
      await page
        .getByRole("spinbutton", { name: "Inches", exact: true })
        .evaluate((el) => el.validity.rangeOverflow),
    ).toBe(true);
    await page
      .getByRole("spinbutton", { name: "Inches", exact: true })
      .fill("11");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/bmi-feet-inches-phone.png",
      fullPage: true,
    });
  } finally {
    await sql`DELETE FROM "user" WHERE email=${email}`;
    await sql.end();
  }
});
