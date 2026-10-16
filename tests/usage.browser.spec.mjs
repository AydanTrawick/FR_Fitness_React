import { test, expect } from "@playwright/test";
const origin = process.env.ASSISTANT_TEST_BASE_URL || "http://localhost:3026";
const safari = process.env.VOICE_TEST_BROWSER === "webkit";
test.use(
  safari
    ? {
        browserName: "webkit",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      }
    : { channel: "chrome", viewport: { width: 1280, height: 1000 } },
);
test.setTimeout(90000);
function balance(overrides = {}) {
  const now = Date.now();
  return {
    checkedAt: now,
    available: true,
    meters: [
      {
        id: "planHour",
        limit: 10,
        remaining: 7,
        used: 3,
        fullAt: now + 3600000,
        availableAt: null,
      },
      {
        id: "planDay",
        limit: 30,
        remaining: 23,
        used: 7,
        fullAt: now + 86400000,
        availableAt: null,
      },
      {
        id: "planIp",
        limit: 30,
        remaining: 27,
        used: 3,
        fullAt: now + 3600000,
        availableAt: null,
      },
      {
        id: "voiceMinute",
        limit: 20,
        remaining: 14,
        used: 6,
        fullAt: now + 60000,
        availableAt: null,
      },
      {
        id: "voiceDay",
        limit: 200,
        remaining: 154,
        used: 46,
        fullAt: now + 86400000,
        availableAt: null,
      },
      {
        id: "ttsCharacters",
        limit: 20000,
        remaining: 1000,
        used: 19000,
        fullAt: now + 86400000,
        availableAt: null,
      },
    ].map((m) => ({ ...m, ...(overrides[m.id] || {}) })),
  };
}
async function setup(page, usageHandler) {
  const user = {
    id: "usage-fixture",
    email: "fixture@example.invalid",
    display_name: "Fixture",
    role: "customer",
    weightUnit: "lb",
    timezone: "America/New_York",
  };
  await page.route("**/api/status", (r) =>
    r.fulfill({
      json: {
        user,
        accounts: true,
        ai: true,
        voice: true,
        voiceInput: true,
        email: false,
        foodSearch: false,
        equipment: false,
        feedbackStorage: false,
      },
    }),
  );
  await page.route("**/api/account", (r) =>
    r.fulfill({ json: { preferences: { aiDataOptIn: false } } }),
  );
  await page.route("**/api/logs", (r) =>
    r.fulfill({ json: { logs: { bmi: [], workout: [], food: [] } } }),
  );
  await page.route("**/api/usage", usageHandler);
  await page.goto(origin + "/testing-assistant");
  await page
    .getByRole("status", { name: "Loading FirstRep Fitness" })
    .waitFor({ state: "detached" });
  await expect(
    page.getByRole("button", { name: "Usage limits", exact: true }),
  ).toBeVisible();
}
test("personal balances, accessible bars, recovery labels, mobile layout and keyboard dismissal", async ({
  page,
}) => {
  let reads = 0;
  await setup(page, (r) => {
    reads++;
    return r.fulfill({ json: balance() });
  });
  await page.getByRole("button", { name: "Usage limits", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Equal Usage Limits" });
  await expect(dialog.getByRole("progressbar")).toHaveCount(6);
  await expect(
    dialog.getByRole("progressbar", {
      name: "Plan requests · hourly",
      exact: true,
    }),
  ).toHaveAttribute("aria-valuenow", "7");
  await expect(
    dialog.getByRole("progressbar", {
      name: "Spoken replies · daily characters",
    }),
  ).toHaveAttribute("aria-valuenow", "1000");
  await expect(
    dialog.getByText("Spoken replies use characters, not audio minutes.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Usage fully resets in 1h 0m", { exact: false }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/usage-${safari ? "iphone" : "desktop"}.png`,
    fullPage: true,
  });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  if (!safari) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/usage-mobile.png",
      fullPage: true,
    });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
  await dialog.getByRole("button", { name: "Got it", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Usage limits", exact: true }),
  ).toBeFocused();
  expect(reads).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Usage limits", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
test("paid requests invalidate balances and polling reflects new use", async ({
  page,
}) => {
  let remaining = 7,
    reads = 0;
  await setup(page, (r) => {
    reads++;
    return r.fulfill({
      json: balance({ planHour: { remaining, used: 10 - remaining } }),
    });
  });
  await page.route("**/api/assistant/chat", (r) =>
    r.fulfill({ json: { replyText: "Take your time.", pendingActions: [] } }),
  );
  await page.clock.install();
  await page.getByRole("button", { name: "Usage limits", exact: true }).click();
  const meter = page.getByRole("progressbar", {
    name: "Plan requests · hourly",
    exact: true,
  });
  await expect(meter).toHaveAttribute("aria-valuenow", "7");
  remaining = 6;
  // A second device/tab can change usage while the modal is open.
  await page.clock.runFor(15010);
  await expect(meter).toHaveAttribute("aria-valuenow", "6");
  remaining = 4;
  await page.evaluate(() =>
    window.dispatchEvent(new Event("firstrep:usage-changed")),
  );
  await expect(meter).toHaveAttribute("aria-valuenow", "4");
  await page.getByRole("button", { name: "Close usage limits" }).click();
  await page
    .getByRole("textbox", { name: "Your request" })
    .fill("What is RPE?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("Take your time.", { exact: true }),
  ).toBeVisible();
  remaining = 5;
  await page.getByRole("button", { name: "Usage limits", exact: true }).click();
  await expect(meter).toHaveAttribute("aria-valuenow", "5");
  expect(reads).toBeGreaterThanOrEqual(3);
});
test("Redis outage shows unknown balances instead of inventing credits; retry recovers", async ({
  page,
}) => {
  let offline = true;
  await setup(page, (r) => {
    const data = balance();
    if (offline) {
      data.available = false;
      data.meters = data.meters.map((m) => ({
        ...m,
        remaining: null,
        used: null,
        availableAt: null,
        fullAt: null,
      }));
    }
    return r.fulfill({ json: data });
  });
  await page.getByRole("button", { name: "Usage limits", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Equal Usage Limits" });
  await expect(
    dialog.getByText(/Your usage can’t be confirmed/),
  ).toBeVisible();
  await expect(dialog.getByRole("progressbar")).toHaveCount(0);
  offline = false;
  await dialog.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(dialog.getByRole("progressbar")).toHaveCount(6);
});
test("expired session discards displayed balances", async ({ page }) => {
  let expired = false;
  await setup(page, (r) =>
    r.fulfill(
      expired
        ? { status: 401, json: { error: "Sign in" } }
        : { json: balance() },
    ),
  );
  await page.getByRole("button", { name: "Usage limits", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Equal Usage Limits" });
  await expect(dialog.getByRole("progressbar")).toHaveCount(6);
  expired = true;
  await dialog.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    dialog.getByText("Sign in again to view your usage."),
  ).toBeVisible();
  await expect(dialog.getByRole("progressbar")).toHaveCount(0);
});

test("recovery countdown refreshes the first returned credit even with a mis-set device clock", async ({
  page,
}) => {
  let reads = 0;
  await setup(page, (r) => {
    const data = balance();
    const meter = data.meters.find((m) => m.id === "voiceMinute");
    if (!reads++) {
      meter.remaining = 0;
      meter.used = 20;
      meter.availableAt = data.checkedAt + 5000;
    } else {
      meter.remaining = 1;
      meter.used = 19;
    }
    return r.fulfill({ json: data });
  });
  await page.clock.install({ time: new Date("2040-01-01T00:00:00Z") });
  await page.getByRole("button", { name: "Usage limits", exact: true }).click();
  const meter = page.getByRole("progressbar", {
    name: "Assistant requests · per minute",
    exact: true,
  });
  await expect(meter).toHaveAttribute("aria-valuenow", "0");
  await expect(
    page.getByText("More available in 5s", { exact: false }),
  ).toBeVisible();
  await page.clock.runFor(5500);
  await expect(meter).toHaveAttribute("aria-valuenow", "1");
  expect(reads).toBeGreaterThanOrEqual(2);
});

test("usage endpoint requires authentication and is never publicly cacheable", async ({
  request,
}) => {
  const response = await request.get(origin + "/api/usage?userId=someone-else");
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("private, no-store");
});
