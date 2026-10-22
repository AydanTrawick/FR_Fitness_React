import { test, expect } from "@playwright/test";
import { dashboardDate, shiftDate } from "../lib/dashboard.ts";
import { evaluateAchievements } from "../lib/achievements/model.ts";
test.use({ channel: "chrome", viewport: { width: 1440, height: 1000 } });
test.setTimeout(60000);
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus)
    await page.screenshot({
      path: info.outputPath("failure.png"),
      fullPage: true,
    });
});
const origin = process.env.AUTH_TEST_BASE_URL || "http://localhost:3027";
const date = dashboardDate(new Date(), "America/New_York");
const row = (id, exercise, weight_kg, sets = 2, d = date) => ({
  id,
  date: d,
  exercise,
  exercise_id: id,
  sets,
  reps: 10,
  weight_kg,
  rpe: 8,
  notes: "",
});
async function fixture(page, empty = false) {
  await page.addInitScript(() =>
    sessionStorage.setItem("firstrep-splash-seen", "1"),
  );
  const logs = {
    bmi: [],
    food: [],
    workout: empty
      ? []
      : [
          row("bench", "Barbell bench press", 100, 3),
          row("rdl", "Romanian deadlift", 80, 3),
          row("pulldown", "Lat pulldown", 60, 2),
          row("curl", "Leg curl", 40, 2),
          row("old", "Bench", 90, 3, shiftDate(date, -1)),
        ],
  };
  await page.route("**/api/status", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "fixture",
          display_name: "Aydan",
          email: "fixture@example.invalid",
          role: "customer",
          weightUnit: "kg",
          timezone: "America/New_York",
        },
        accounts: true,
        ai: true,
        voice: false,
        foodSearch: false,
        equipment: false,
        email: false,
      },
    }),
  );
  await page.route("**/api/logs", (r) => r.fulfill({ json: { logs } }));
  await page.route("**/api/achievements", (r) =>
    r.fulfill({
      json: evaluateAchievements({
        today: date,
        facts: [...new Set(logs.workout.map((r) => r.date))].map((d) => ({
          date: d,
          session: d,
          values: { workouts_logged: 1, active: 1 },
        })),
      }),
    }),
  );

  await page.route("**/api/exercises?*", (r) =>
    r.fulfill({
      json: {
        exercises: [
          { id: "bench", name: "Barbell bench press", primary_muscle: "Chest" },
          {
            id: "rdl",
            name: "Romanian deadlift",
            primary_muscle: "Hamstrings",
          },
          { id: "pulldown", name: "Lat pulldown", primary_muscle: "Back" },
          { id: "curl", name: "Leg curl", primary_muscle: "Hamstrings" },
        ],
      },
    }),
  );
  await page.route("**/api/account", (r) =>
    r.fulfill({ json: { preferences: { aiDataOptIn: false } } }),
  );
  await page.goto(origin + "/testing-dashboard", {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("heading", {
      name: empty ? "Let’s get moving, Aydan." : "Nice work, Aydan.",
    }),
  ).toBeVisible({ timeout: 90000 });
  // The development-only Next badge overlaps the production mobile dock.
  await page.addStyleTag({ content: "nextjs-portal {display:none!important}" });
}
test("dashboard uses saved activity, converts units, shares cards and completes the finder", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await fixture(page);
  await expect(page.getByRole("img", { name: /1 of 3 daily/ })).toBeVisible();
  await expect(page.getByText("+100 XP today")).toBeVisible();
  await page
    .getByRole("button", { name: "Share workout card", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Close card editor", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Dashboard views" })
    .getByRole("button", { name: "Progress" })
    .click();
  await expect(page.getByText("100 kg × 10", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "lb", exact: true }).click();
  await expect(page.getByText("220.5 lb × 10", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Share this lift" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Close card editor", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/dashboard-progress-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "Dashboard views" })
    .getByRole("button", { name: "Quests" })
    .click();
  await page.getByRole("button", { name: "4 Upper / Lower" }).click();
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByRole("button", { name: "Muscle", exact: true }).click();
  await page.getByRole("button", { name: "Next question" }).click();
  await page
    .getByRole("button", { name: "Find my program", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Preview your program" }),
  ).toHaveAttribute("href", /\/programs\/.+/);
  await expect(page.getByText("Earned", { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
test("phone layouts show usable navigation, real badges and no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  for (const view of ["Home", "Progress", "Quests"]) {
    await page
      .getByRole("navigation", { name: "Quick dashboard navigation" })
      .getByRole("button", { name: view, exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBeTruthy();
    await page.screenshot({
      path: `test-results/dashboard-${view.toLowerCase()}-phone.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Open training assistant" }).click();
  await expect(
    page.getByRole("heading", { name: "Training assistant." }),
  ).toBeVisible();
});
test("new account shows honest empty states and a working log action", async ({
  page,
}) => {
  await fixture(page, true);
  await expect(page.getByRole("img", { name: /0 of 3 daily/ })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Dashboard views" })
    .getByRole("button", { name: "Quests" })
    .click();
  await expect(page.getByText("0 of 50 earned")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Dashboard views" })
    .getByRole("button", { name: "Today" })
    .click();
  await page.getByRole("button", { name: "Log your first set" }).click();
  await expect(page).toHaveURL(/#workout$/);
});
