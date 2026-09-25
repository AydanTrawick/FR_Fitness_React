const origin = process.env.TEST_BASE_URL ?? "http://localhost:3020";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
test.setTimeout(90000);
test.use({
  channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
  viewport: { width: 1440, height: 1000 },
});
test("library, filters, details, builder and mobile layout", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${origin}/#exercises`);
  await expect(
    page.getByRole("heading", { name: /Discover your.*next exercise/ }),
  ).toBeVisible({ timeout: 20000 });
  await page
    .getByRole("searchbox", { name: "Search exercises" })
    .fill("bench press");
  await expect(
    page.getByRole("heading", { name: "Barbell bench press", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View Barbell bench press", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "How to perform" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add to Workout", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Exercises and workouts" })
    .getByRole("link", { name: /Build Workout/ })
    .click();
  await page
    .getByRole("textbox", { name: "Workout name", exact: true })
    .fill("Upper Body Strength");
  await expect(
    page.getByRole("spinbutton", { name: "Sets", exact: true }),
  ).toHaveValue("3");
  await page.getByRole("spinbutton", { name: "Sets", exact: true }).fill("4");
  page.once("dialog", (d) => d.accept());
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Workout name", exact: true }),
  ).toHaveValue("Upper Body Strength");
  await expect(
    page.getByRole("spinbutton", { name: "Sets", exact: true }),
  ).toHaveValue("4");
  await page
    .getByRole("navigation", { name: "Exercises and workouts" })
    .getByRole("link", { name: "Exercise Library", exact: true })
    .click();
  await page.getByRole("searchbox", { name: "Search exercises" }).fill("press");
  await page.getByRole("combobox").nth(0).selectOption("Barbells");
  await page.getByRole("button", { name: "Chest", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Barbell bench press", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/firstrep-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(page.getByRole("combobox").nth(1)).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/firstrep-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "Exercises and workouts" })
    .getByRole("link", { name: /Build Workout/ })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Workout name", exact: true }),
  ).toHaveValue("Upper Body Strength");
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});
test("authenticated user completes save, edit, favorite, duplicate and delete flow", async ({
  page,
}) => {
  const sql = postgres(process.env.NEON_DATABASE_URL, {
    ssl: "require",
    max: 1,
  });
  let userId;
  try {
    const reg = await page.request.post(`${origin}/api/auth`, {
      data: {
        action: "register",
        email: `browser-test-${randomUUID()}@example.invalid`,
        password: randomUUID(),
        display_name: "Browser Test",
      },
    });
    expect(reg.status()).toBe(200);
    userId = (await reg.json()).user.id;
    await page.goto(`${origin}/#exercises`);
    await page
      .getByRole("searchbox", { name: "Search exercises" })
      .fill("bench press");
    await page.route("**/api/library/favorites", async (route) => {
      if (route.request().method() === "PUT")
        await route.fulfill({
          status: 500,
          json: { error: "Test persistence failure" },
        });
      else await route.continue();
    });
    await page
      .getByRole("button", {
        name: "Favorite Barbell bench press",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Test persistence failure" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Favorite Barbell bench press",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "false");
    await page.unroute("**/api/library/favorites");
    await page
      .getByRole("button", {
        name: "Favorite Barbell bench press",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Unfavorite Barbell bench press",
        exact: true,
      }),
    ).toBeVisible();
    const nav = page.getByRole("navigation", {
      name: "Exercises and workouts",
    });
    await nav
      .getByRole("link", { name: "Favorite Exercises", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Barbell bench press", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Add Barbell bench press to workout",
        exact: true,
      })
      .click();
    await nav.getByRole("link", { name: /Build Workout/ }).click();
    await page
      .getByRole("textbox", { name: "Workout name", exact: true })
      .fill("Upper Body Strength");
    await page.getByRole("spinbutton", { name: "Sets", exact: true }).fill("4");
    await page
      .getByRole("button", { name: "Save Workout", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Upper Body Strength", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "View Workout", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Edit Workout", exact: true })
      .click();
    await expect(
      page.getByRole("spinbutton", { name: "Sets", exact: true }),
    ).toHaveValue("4");
    await page
      .getByRole("textbox", { name: "Workout name", exact: true })
      .fill("Upper Body Strength revised");
    await page
      .getByRole("button", { name: "Save Workout", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Favorite Upper Body Strength revised",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Favorite Workouts", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Upper Body Strength revised",
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", {
        name: "Unfavorite Upper Body Strength revised",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Duplicate", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Upper Body Strength revised (copy)",
        exact: true,
      }),
    ).toBeVisible();
    const card = page.locator("article").filter({
      has: page.getByRole("heading", {
        name: "Upper Body Strength revised (copy)",
        exact: true,
      }),
    });
    await card.getByRole("button", { name: "Delete", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete Workout", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Upper Body Strength revised (copy)",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "Upper Body Strength revised",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    if (userId) await sql`DELETE FROM firstrep_users WHERE id=${userId}`;
    await sql.end();
  }
});
