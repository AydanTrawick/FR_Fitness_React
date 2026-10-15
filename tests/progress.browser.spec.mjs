import { test, expect as baseExpect } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 20000 });
import { randomUUID } from "node:crypto";
import postgres from "postgres";
const origin = process.env.PROGRESS_TEST_BASE_URL || "http://localhost:3026";
const sql = postgres(process.env.NEON_DATABASE_URL, {
  ssl: "require",
  max: 1,
  connect_timeout: 10,
  idle_timeout: 10,
  onnotice: () => {},
});
test.use({ channel: "chrome", viewport: { width: 1440, height: 1000 } });
test.setTimeout(180000);
const ids = [];
test.afterAll(async () => {
  for (const id of ids) await sql`DELETE FROM "user" WHERE id=${id}`;
  await sql.end();
});
async function login(page) {
  const email = `progress-test-${randomUUID()}@example.invalid`;
  const password = "A!7" + randomUUID() + "Z9";
  const response = await page.request.post(origin + "/api/auth/sign-up/email", {
    headers: {
      origin,
      "x-forwarded-for": "192.0.2." + (10 + Math.floor(Math.random() * 220)),
    },
    data: {
      email,
      password,
      name: "Progress test athlete",
      acceptedTerms: true,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const row = (await sql`SELECT id FROM "user" WHERE email=${email}`)[0];
  ids.push(row.id);
  await sql`UPDATE "user" SET email_verified=true,onboarded=true WHERE id=${row.id}`;
  const signin = await page.request.post(origin + "/api/auth/sign-in/email", {
    headers: { origin },
    data: { email, password },
  });
  expect(signin.ok()).toBe(true);
  return row.id;
}
test("baseline, streamed goal confirmation, saved library plan, versioned edit, and mobile persistence", async ({
  page,
  browser,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const id = await login(page);
  await page.goto(origin + "/progress");
  await expect(page.getByRole("link", { name: "Start Baseline" })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("link", { name: "Start Baseline" }).click();
  await page.getByLabel("Weight (lb)").fill("160");
  await page.getByLabel("Feet", { exact: true }).fill("5");
  await page.getByLabel("Inches", { exact: true }).fill("11");
  await page.getByLabel("Birth year").fill("1996");
  await page.getByLabel("Sex (for calorie estimates)").selectOption("male");
  await page.getByLabel("Training days per week").selectOption("3");
  await page.getByRole("button", { name: "Save check-in & continue" }).click();
  await expect(page.getByText("WEIGHT CHECK-IN SAVED")).toBeVisible();
  await expect(
    page.getByText("Private photo uploads aren’t connected yet.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Continue to coach" }).click();
  await page
    .getByLabel("Message your coach")
    .fill("I want to gain weight and build a bigger chest in 12 weeks.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("YOUR GOAL CARD")).toBeVisible({
    timeout: 30000,
  });
  await page
    .getByRole("button", { name: "Looks good · Create Playbook" })
    .click();
  await expect(page).toHaveURL(origin + "/playbook", { timeout: 30000 });
  await expect(page.getByText("SAVED PLAYBOOK · VERSION 1")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Strength day 1" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save to my workouts" })
    .first()
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "saved to Saved Workouts" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^Favorite / })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: /^Favorite / }).first(),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    (await sql`SELECT id FROM firstrep_saved_workouts WHERE user_id=${id}`)
      .length,
  ).toBe(1);
  expect(
    (
      await sql`SELECT exercise_id FROM firstrep_favorite_exercises WHERE user_id=${id}`
    ).length,
  ).toBe(1);
  await page.getByRole("button", { name: "Nutrition", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your grocery list" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Habits", exact: true }).click();
  await page.getByRole("checkbox", { name: "Sleep consistently" }).check();
  await expect(
    page.getByRole("checkbox", { name: "Sleep consistently" }),
  ).toBeEnabled();
  await page.reload();
  await page.getByRole("button", { name: "Habits", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Sleep consistently" }),
  ).toBeChecked();
  await page.goto(origin + "/coach");
  await expect(
    page.getByText(
      "I want to gain weight and build a bigger chest in 12 weeks.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByLabel("Message your coach")
    .fill("I don't eat pork. Update my meal plan.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("PROPOSED ADJUSTMENT")).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByRole("button", { name: "Approve adjustment" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Preview proposed Playbook" }).click();
  await expect(
    page.getByRole("button", { name: "Approve adjustment" }),
  ).toBeEnabled();
  expect(
    (
      await sql`SELECT max(version) AS version FROM playbooks WHERE user_id=${id}`
    )[0].version,
  ).toBe(1);
  await page.getByRole("button", { name: "Approve adjustment" }).click();
  await expect(page.getByText("accepted", { exact: true })).toBeVisible();
  await page.goto(origin + "/playbook");
  await expect(page.getByText("SAVED PLAYBOOK · VERSION 2")).toBeVisible();
  expect(
    (
      await sql`SELECT plan FROM playbooks WHERE user_id=${id} ORDER BY version DESC LIMIT 1`
    )[0].plan.nutrition.diet_restrictions,
  ).toContain("no pork");
  // Another authenticated device reads the same database-backed plan and chat.
  const device = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await device.addCookies(await page.context().cookies());
  const mobile = await device.newPage();
  await mobile.goto(origin + "/playbook");
  await expect(mobile.getByText("SAVED PLAYBOOK · VERSION 2")).toBeVisible();
  await mobile.getByRole("button", { name: "Nutrition", exact: true }).click();
  await expect(
    mobile.getByRole("heading", { name: "Your grocery list" }),
  ).toBeVisible();
  await mobile.screenshot({
    path: "test-results/progress-playbook-mobile.png",
    fullPage: true,
  });
  const overflow = await mobile.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1)
      .map((e) => ({
        tag: e.tagName,
        className: String(e.className),
        width: Math.round(e.getBoundingClientRect().width),
      }))
      .slice(0, 12),
  );
  expect(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    JSON.stringify(overflow),
  ).toBe(true);
  await mobile.screenshot({
    path: "test-results/progress-playbook-mobile.png",
    fullPage: true,
  });
  await mobile.goto(origin + "/progress");
  await expect(mobile.getByText("160.0 lb").first()).toBeVisible();
  await mobile.screenshot({
    path: "test-results/progress-timeline-mobile.png",
    fullPage: true,
  });
  await device.close();
  expect(errors).toEqual([]);
});
test("ownership, approval state, rate-limit infrastructure, deletion queue, and under-18 upload protections", async ({
  page,
}) => {
  const id = await login(page);
  const foreign = randomUUID();
  const checkin = randomUUID();
  const body = {
    id: checkin,
    weight_kg: 65,
    energy: 3,
    soreness: 2,
    adherence: 4,
    notes: "",
    profile: {
      height_cm: 170,
      sex: "unspecified",
      birth_year: new Date().getUTCFullYear() - 16,
      experience: "beginner",
      equipment: ["Bodyweight"],
      days_per_week: 3,
      diet_restrictions: [],
      units_pref: "metric",
      hide_bodyfat: true,
    },
  };
  const post = (path, data) =>
    page.request.post(origin + "/api/" + path, { headers: { origin }, data });
  expect((await post("progress/checkins", body)).ok()).toBe(true);
  expect(
    (await post("progress/consent", { consent: true, adult: true })).status(),
  ).toBe(403);
  expect((await post("progress/goals/confirm", { id: foreign })).status()).toBe(
    404,
  );
  expect(
    (
      await page.request.get(origin + `/api/progress/photos/${foreign}/url`)
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.get(
        origin +
          `/api/progress/photos/${foreign}?expires=9999999999&signature=invalid`,
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post(origin + "/api/progress/checkins", {
        headers: { origin: "https://untrusted.invalid" },
        data: body,
      })
    ).status(),
  ).toBe(403);
  expect((await post("progress/checkins", body)).status()).toBe(409);
  const photo = randomUUID();
  const key = "test-fixture-private/" + randomUUID();
  await sql`INSERT INTO checkin_photos(id,checkin_id,user_id,pose,storage_key,width,height) VALUES (${photo},${checkin},${id},'front',${key},100,100)`;
  const other = await page.context().browser().newContext();
  const otherPage = await other.newPage();
  await login(otherPage);
  expect(
    (
      await otherPage.request.get(origin + `/api/progress/photos/${photo}/url`)
    ).status(),
  ).toBe(404);
  await other.close();
  await sql`DELETE FROM checkin_photos WHERE id=${photo}`;
  expect(
    (
      await sql`SELECT storage_key FROM progress_photo_deletions WHERE storage_key=${key}`
    ).length,
  ).toBe(1);
  await sql`DELETE FROM progress_photo_deletions WHERE storage_key=${key}`;
  expect(
    (await post("coach", { prompt: "I skip meals to punish myself" })).ok(),
  ).toBe(true);
  expect(
    (
      await sql`SELECT nutrition_paused FROM user_body_profile WHERE user_id=${id}`
    )[0].nutrition_paused,
  ).toBe(true);
  expect((await post("progress/goals/confirm", { id: foreign })).status()).toBe(
    422,
  );
});
