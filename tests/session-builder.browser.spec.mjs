import { test, expect as baseExpect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";
const origin = process.env.AUTH_TEST_BASE_URL || "http://localhost:3025";
const expect = baseExpect.configure({ timeout: 25000 });
test.setTimeout(240000);
test.use({ actionTimeout: 60000 });
test("session builder persists plans, filters, supersets, cancel and idempotent start", async ({
  page,
  request,
}) => {
  const sql = postgres(process.env.NEON_DATABASE_URL, {
    ssl: "require",
    max: 1,
  });
  const userId = randomUUID(),
    email = "builder-" + randomUUID() + "@example.invalid",
    password = "A!7" + randomUUID() + "z9";
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", async (r) => {
    if (r.url().includes("/api/") && r.status() >= 400)
      console.log(
        "API failure",
        new URL(r.url()).pathname,
        r.status(),
        await r.text(),
      );
  });
  try {
    expect((await request.get(origin + "/api/exercises/counts")).status()).toBe(
      401,
    );
    const hash = await hashPassword(password);
    await sql.begin(async (tx) => {
      await tx`INSERT INTO "user"(id,name,email,email_verified,onboarded,terms_version_accepted,terms_accepted_at,weight_unit) VALUES(${userId},'Builder fixture',${email},true,true,'2026-10-02',NOW(),'kg')`;
      await tx`INSERT INTO firstrep_users(id,email,display_name,password_hash,password_salt,role) VALUES(${userId},${email},'Builder fixture','','','customer')`;
      await tx`INSERT INTO account(id,account_id,provider_id,user_id,password,updated_at) VALUES(${randomUUID()},${userId},'credential',${userId},${hash},NOW())`;
    });
    await page.request.get(origin + "/api/auth/get-session");
    expect(
      (
        await page.request.post(origin + "/api/auth/sign-in/email", {
          headers: { origin },
          data: { email, password },
        })
      ).ok(),
    ).toBe(true);
    await page.addInitScript(() =>
      sessionStorage.setItem("firstrep-splash-seen", "1"),
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(origin + "/#workout");
    await page
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    const setup = page.getByRole("dialog");
    await expect(
      setup.getByRole("heading", { name: "Ready to train?" }),
    ).toBeVisible();
    await expect(setup.locator(".sb-hero")).toBeVisible();
    await page.screenshot({
      path: "/tmp/frtk-lobby-desktop.png",
      fullPage: true,
    });
    const hold = setup.getByRole("button", {
      name: "Hold to start workout",
      exact: true,
    });
    await hold.scrollIntoViewIfNeeded();
    const box = await hold.boundingBox();
    await page.mouse.move(box.x + 40, box.y + 20);
    await page.mouse.down();
    await page.waitForTimeout(200);
    await page.mouse.up();
    await expect(setup.locator(".sb-countdown")).toHaveCount(0);
    expect(
      (await sql`SELECT id FROM firstrep_live_sessions WHERE user_id=${userId}`)
        .length,
    ).toBe(0);
    await setup.getByRole("button", { name: /From scratch/ }).click();
    await expect(setup.locator(".sb-exercise").first()).toBeVisible();
    await setup
      .getByRole("button", { name: "Chest", exact: true })
      .first()
      .click();
    await expect(
      setup.locator(".sb-muscle-chips button[aria-pressed=true]"),
    ).toContainText("Chest");
    await setup.getByRole("searchbox").fill("bench");
    await expect
      .poll(() => setup.locator(".sb-exercise strong").allTextContents())
      .toContain("Barbell Bench Press - Medium Grip");
    const card = setup
      .locator(".sb-exercise")
      .filter({ hasText: "Barbell Bench Press - Medium Grip" })
      .first();
    await card.getByRole("button", { name: /^Add / }).click();
    await expect(card.getByRole("button", { name: /^Remove / })).toBeVisible();
    await setup.getByRole("searchbox").fill("");
    await setup
      .getByRole("button", { name: "All", exact: true })
      .first()
      .click();
    await expect(setup.locator(".sb-exercise").nth(2)).toBeVisible();
    await setup
      .locator(".sb-exercise")
      .nth(0)
      .getByRole("button", { name: /^Add / })
      .click();
    await setup
      .locator(".sb-exercise")
      .nth(1)
      .getByRole("button", { name: /^Add / })
      .click();
    await setup.evaluate((e) => e.scrollTo(0, 0));
    await page.screenshot({
      path: "/tmp/frtk-map-desktop.png",
      fullPage: true,
    });
    await setup.getByRole("button", { name: /Next: order lifts/ }).click();
    await expect(setup.locator(".sb-stack-list li")).toHaveCount(3);
    const names = await setup
      .locator(".sb-stack-name strong")
      .allTextContents();
    await setup
      .getByRole("checkbox", { name: `Select ${names[0]} for superset` })
      .check();
    await setup
      .getByRole("checkbox", { name: `Select ${names[1]} for superset` })
      .check();
    await setup
      .getByRole("button", { name: "Link as superset", exact: true })
      .click();
    await expect(setup.locator(".sb-stack-row.superset")).toHaveCount(2);
    const grip = setup.getByRole("button", {
      name: `Reorder ${names[0]}`,
      exact: true,
    });
    await grip.focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(250);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(250);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(250);
    await page.keyboard.press("Space");
    await expect(setup.locator(".sb-stack-row.superset")).toHaveCount(0);
    const orderBeforeMouse = await setup
      .locator(".sb-stack-name strong")
      .allTextContents();
    const handles = setup.locator(".sb-grip");
    await handles.first().scrollIntoViewIfNeeded();
    const mouseFrom = await handles.first().boundingBox(),
      mouseTo = await handles.nth(1).boundingBox();
    await page.mouse.move(mouseFrom.x + 8, mouseFrom.y + 8);
    await page.mouse.down();
    await page.waitForTimeout(180);
    await page.mouse.move(mouseTo.x + 8, mouseTo.y + 8, { steps: 10 });
    await page.waitForTimeout(150);
    await page.mouse.up();
    await expect
      .poll(() => setup.locator(".sb-stack-name strong").allTextContents())
      .not.toEqual(orderBeforeMouse);
    await setup
      .getByLabel("Session name", { exact: true })
      .fill("Builder test plan");
    await setup
      .getByRole("button", { name: "Save as template", exact: true })
      .click();
    await expect(
      setup.getByRole("status").filter({ hasText: "Workout saved" }),
    ).toBeVisible();
    await setup
      .getByRole("button", { name: "Save as template", exact: true })
      .click();
    await expect(setup.getByRole("alertdialog")).toBeVisible();
    await setup.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.screenshot({
      path: "/tmp/frtk-stack-desktop.png",
      fullPage: true,
    });
    await setup.getByRole("button", { name: "Close session setup" }).click();
    await page.reload();
    await page
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    await setup.getByRole("button", { name: /Continue your draft/ }).click();
    await expect(setup.getByLabel("Session name", { exact: true })).toHaveValue(
      "Builder test plan",
    );
    await setup.getByRole("button", { name: "Close session setup" }).click();
    await page.evaluate(() => {
      const e = JSON.parse(localStorage.getItem("session-draft:v1"));
      e.draft.updatedAt = Date.now() - 25 * 3600000;
      localStorage.setItem("session-draft:v1", JSON.stringify(e));
    });
    await page
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    await expect(setup.getByText(/Resume your draft\?/)).toBeVisible();
    await setup
      .getByRole("button", { name: "Resume draft", exact: true })
      .click();
    expect(
      await page.evaluate(
        () =>
          Date.now() -
          JSON.parse(localStorage.getItem("session-draft:v1")).draft.updatedAt,
      ),
    ).toBeLessThan(60000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "/tmp/frtk-map-mobile.png", fullPage: true });
    expect(await setup.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(
      false,
    );
    await setup
      .getByRole("button", { name: "Add your own exercise", exact: true })
      .click();
    await setup
      .getByLabel("Custom exercise name", { exact: true })
      .fill("Custom band lift");
    await setup
      .getByLabel("Custom exercise target muscle")
      .selectOption("biceps");
    await setup
      .getByRole("button", { name: "Add custom exercise", exact: true })
      .click();
    await setup.getByRole("button", { name: /Next: order lifts/ }).click();
    await expect(setup.locator(".sb-stack-list li")).toHaveCount(4);
    await page.screenshot({
      path: "/tmp/frtk-stack-mobile.png",
      fullPage: true,
    });
    expect(await setup.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(
      false,
    );
    await page.context().setOffline(true);
    await setup
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    await expect(setup.getByRole("alert")).toContainText(
      "check your connection",
    );
    await page.context().setOffline(false);
    const touchOrder = await setup
      .locator(".sb-stack-name strong")
      .allTextContents();
    await setup.evaluate((el) => {
      const row = el.querySelector(".sb-stack-row");
      el.scrollTop +=
        row.getBoundingClientRect().top - el.getBoundingClientRect().top - 70;
    });
    const touchFrom = await setup.locator(".sb-grip").first().boundingBox(),
      touchTo = await setup.locator(".sb-grip").nth(1).boundingBox();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 1,
    });
    const point = (x, y) => ({ x, y, radiusX: 1, radiusY: 1, force: 1, id: 0 });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point(touchFrom.x + 8, touchFrom.y + 8)],
    });
    await page.waitForTimeout(180);
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          point(
            touchTo.x + 8,
            touchFrom.y + 8 + ((touchTo.y - touchFrom.y) * i) / 8,
          ),
        ],
      });
      await page.waitForTimeout(20);
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(() => setup.locator(".sb-stack-name strong").allTextContents())
      .not.toEqual(touchOrder);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await cdp.detach();
    expect(
      (
        await page.request.patch(origin + "/api/sessions/" + randomUUID(), {
          headers: { origin },
          data: { action: "start" },
        })
      ).status(),
    ).toBe(404);
    const created = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/sessions") && r.request().method() === "POST",
    );
    await setup
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    const response = await created;
    expect(response.ok()).toBe(true);
    const { sessionId } = await response.json();
    await setup.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            await sql`SELECT id FROM firstrep_live_sessions WHERE id=${sessionId}`
          ).length,
      )
      .toBe(0);
    const raw = await page.evaluate(
      () => JSON.parse(localStorage.getItem("session-draft:v1")).draft,
    );
    expect(raw.exercises.length).toBe(4);
    const headers = { origin, "Idempotency-Key": userId + ":" + raw.updatedAt };
    const [r1, r2] = await Promise.all([
      page.request.post(origin + "/api/sessions", { headers, data: raw }),
      page.request.post(origin + "/api/sessions", { headers, data: raw }),
    ]);
    expect(r1.ok()).toBe(true);
    expect(r2.ok()).toBe(true);
    const first = await r1.json(),
      second = await r2.json();
    expect(first.sessionId).toBe(second.sessionId);
    expect(
      (await sql`SELECT id FROM firstrep_live_sessions WHERE user_id=${userId}`)
        .length,
    ).toBe(1);
    await page.request.delete(origin + "/api/sessions/" + first.sessionId, {
      headers: { origin },
    });
    await setup
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Live workout session" }),
    ).toBeVisible();
    expect(
      (
        await sql`SELECT id FROM firstrep_live_sessions WHERE user_id=${userId} AND started_at IS NOT NULL`
      ).length,
    ).toBe(1);
    expect(
      (
        await sql`SELECT id FROM firstrep_workout_entries WHERE user_id=${userId}`
      ).length,
    ).toBe(0);
    expect(page.url()).toContain("/session/");
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("session-draft:v1")).draft.exercises
            .length,
      ),
    ).toBe(0);
    const live = page.getByRole("dialog", { name: "Live workout session" });
    await live
      .getByRole("button", { name: "Complete set 1", exact: true })
      .click();
    await expect(
      live.getByRole("button", { name: "Undo set 1", exact: true }),
    ).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.reload();
    await expect(live).toBeVisible();
    await expect(
      live.getByRole("button", { name: "Undo set 1", exact: true }),
    ).toBeVisible();
    await live
      .getByRole("button", { name: "Finish workout", exact: true })
      .first()
      .click();
    const confirm = page.getByRole("button", {
      name: /Finish.*save|Save.*finish|Finish now/i,
    });
    if (await confirm.count()) await confirm.first().click();
    await expect(
      page.getByRole("dialog", { name: "Workout session recap" }),
    ).toBeVisible();
    expect(
      (
        await sql`SELECT id FROM firstrep_workout_entries WHERE user_id=${userId}`
      ).length,
    ).toBe(1);
    expect(
      (
        await sql`SELECT id FROM firstrep_live_sessions WHERE user_id=${userId} AND finished_at IS NOT NULL`
      ).length,
    ).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await sql`DELETE FROM firstrep_users WHERE id=${userId}`;
    await sql`DELETE FROM "user" WHERE id=${userId}`;
    await sql.end();
  }
});
