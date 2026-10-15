import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
const origin = process.env.ASSISTANT_TEST_BASE_URL || "http://localhost:3026";
test.use({ channel: "chrome", viewport: { width: 1440, height: 1000 } });
test.setTimeout(180000);
test("assistant routes require authentication", async ({ request }) => {
  for (const path of [
    "chat",
    `actions/${randomUUID()}/confirm`,
    `actions/${randomUUID()}/cancel`,
  ]) {
    const response = await request.post(`${origin}/api/assistant/${path}`, {
      data: {},
    });
    expect(response.status()).toBe(401);
  }
});
test("typed drafts, edit, confirm, cancel, unknown nutrients and mobile", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const logs = { bmi: [], workout: [], food: [] };
  let saved = 0;
  let lastConversation;
  const user = {
    id: "fixture",
    email: "fixture@example.invalid",
    display_name: "Fixture",
    role: "customer",
    weightUnit: "lb",
    timezone: "America/New_York",
  };
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        user,
        accounts: true,
        ai: true,
        voice: false,
        email: false,
        foodSearch: false,
        equipment: false,
        feedbackStorage: false,
      },
    }),
  );
  await page.route("**/api/account", (route) =>
    route.fulfill({ json: { preferences: { aiDataOptIn: false } } }),
  );
  await page.route("**/api/logs", (route) => route.fulfill({ json: { logs } }));
  await page.route("**/api/assistant/chat", async (route) => {
    const request = route.request().postDataJSON();
    lastConversation = request.conversationId;
    const food = /steak/i.test(request.prompt);
    const payload = food
      ? {
          food_name: "Steak",
          log_date: "2026-10-14",
          meal: "unspecified",
          protein_g: 40,
          carbs_g: null,
          fat_g: null,
          calories: null,
          values_source: "user_stated",
        }
      : {
          exercise_name: "Bench Press",
          exercise_id: "bench",
          sets: [{ reps: 10, weight: 225, unit: "lb", rpe: null }],
          notes: "",
          performed_at: "2026-10-14T20:00:00Z",
          date: "2026-10-14",
        };
    await route.fulfill({
      json: {
        replyText: "Review and confirm to save. Nothing saved yet.",
        pendingActions: [
          {
            id: randomUUID(),
            kind: food ? "food" : "workout_set",
            status: "pending",
            payload,
            expires_at: new Date(Date.now() + 1800000).toISOString(),
          },
        ],
      },
    });
  });
  await page.route("**/api/assistant/actions/*/*", async (route) => {
    const request = route.request().postDataJSON();
    expect(request.conversationId).toBe(lastConversation);
    if (route.request().url().endsWith("/cancel"))
      return route.fulfill({ json: { status: "cancelled" } });
    saved++;
    const payload = request.payload;
    if (payload.food_name)
      logs.food.push({
        id: randomUUID(),
        date: payload.log_date,
        food: payload.food_name,
        protein_g: payload.protein_g,
        carbs_g: payload.carbs_g,
        fat_g: payload.fat_g,
        calories: payload.calories,
        meal: payload.meal,
        values_source: payload.values_source,
        source: "text",
      });
    await route.fulfill({
      json: { status: "confirmed", resultIds: [randomUUID()] },
    });
  });
  await page.goto(`${origin}/testing-assistant#assistant`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  const prompt = page.getByRole("textbox", { name: "Your request" });
  await prompt.fill(
    "I just did a set of bench press for 10 reps at 225 pounds, add that to my workout log.",
  );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  let card = page.getByRole("form", { name: "Review workout log" });
  await expect(card).toContainText("10 reps · 225 lb");
  expect(saved).toBe(0);
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  await card.getByLabel("Weight, set 1", { exact: true }).fill("227.5");
  await expect(card.getByLabel("RPE, set 1 (optional)")).toHaveValue("");
  await card
    .getByRole("button", { name: "Confirm and save", exact: true })
    .click();
  await expect(
    page.getByText("Saved to workout log.", { exact: false }),
  ).toBeVisible();
  expect(saved).toBe(1);
  await prompt.fill(
    "I just had a steak, add 40 grams of protein to my food log today.",
  );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  card = page.getByRole("form", { name: "Review food log" });
  await expect(card).toContainText("protein: 40 g");
  await expect(card).toContainText("calories: Not provided");
  await page.screenshot({
    path: "test-results/assistant-food-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(card.getByLabel("carbs in g (optional)")).toHaveValue("");
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/assistant-edit-mobile.png",
    fullPage: true,
  });
  await card.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Draft cancelled. Nothing added.")).toBeVisible();
  expect(saved).toBe(1);
  await prompt.fill("Add Steak with 40 grams protein to my food log");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page
    .getByRole("form", { name: "Review food log" })
    .getByRole("button", { name: "Confirm and save", exact: true })
    .click();
  await expect(
    page.getByText("Saved to food log.", { exact: false }),
  ).toBeVisible();
  expect(saved).toBe(2);
  expect(logs.food[0].carbs_g).toBeNull();
  expect(logs.food[0].calories).toBeNull();
  expect(errors).toEqual([]);
});
