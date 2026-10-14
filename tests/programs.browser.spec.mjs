import {
  test,
  expect as baseExpect,
  request as apiRequest,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";
const origin = process.env.AUTH_TEST_BASE_URL || "http://localhost:3026";
const expect = baseExpect.configure({ timeout: 20000 });
test.use({ viewport: { width: 1440, height: 1050 }, reducedMotion: "reduce" });
test.setTimeout(180000);
async function fixture(sql, client, unit = "lb") {
  const id = randomUUID(),
    email = "firstrep-test-" + randomUUID() + "@example.invalid",
    password = "A!7" + randomUUID() + "z9",
    hash = await hashPassword(password);
  await sql.begin(async (tx) => {
    await tx`INSERT INTO "user"(id,name,email,email_verified,onboarded,terms_version_accepted,terms_accepted_at,weight_unit,timezone) VALUES(${id},'Program test',${email},true,true,'2026-10-02',NOW(),${unit},'America/New_York')`;
    await tx`INSERT INTO firstrep_users(id,email,display_name,password_hash,password_salt,role) VALUES(${id},${email},'Program test','','','customer')`;
    await tx`INSERT INTO account(id,account_id,provider_id,user_id,password,updated_at) VALUES(${randomUUID()},${id},'credential',${id},${hash},NOW())`;
  });
  await client.get(origin + "/api/auth/get-session");
  const login = await client.post(origin + "/api/auth/sign-in/email", {
    headers: { origin },
    data: { email, password },
  });
  expect(login.status()).toBe(200);
  return id;
}
async function action(client, data) {
  return client.post(origin + "/api/programs", { headers: { origin }, data });
}
async function state(client) {
  const r = await client.get(origin + "/api/programs");
  expect(r.ok()).toBe(true);
  return r.json();
}
async function loaded(page) {
  await page
    .getByRole("status", { name: "Loading FirstRep Fitness" })
    .waitFor({ state: "detached", timeout: 10000 });
}
async function clean(sql, ids) {
  for (const id of ids)
    await sql.begin(async (tx) => {
      await tx`DELETE FROM "user" WHERE id=${id}`;
      await tx`DELETE FROM firstrep_users WHERE id=${id}`;
    });
  await sql.end();
}
test("library filters, account bookmarks/swaps, detail logging, mobile recovery and completion", async ({
  page,
}) => {
  const sql = postgres(process.env.NEON_DATABASE_URL, {
      ssl: "require",
      max: 1,
    }),
    ids = [],
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let other;
  try {
    expect((await page.request.get(origin + "/api/programs")).status()).toBe(
      401,
    );
    ids.push(await fixture(sql, page.request));
    await page.goto(origin + "/programs");
    await loaded(page);
    await expect(page.locator(".pl-card")).toHaveCount(5);
    await expect(
      page.locator(".pl-card").first().locator(".pl-card-footer"),
    ).toContainText("45 min");
    await expect(page.locator(".pl-card").first()).not.toContainText("45–45");
    await page
      .getByRole("button", { name: "Save Low Volume Strength", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Unsave Low Volume Strength",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await loaded(page);
    await expect(
      page.getByRole("button", {
        name: "Unsave Low Volume Strength",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("group", { name: "Days per week" })
      .getByRole("button", { name: "3", exact: true })
      .click();
    await page.getByRole("button", { name: "Muscle", exact: true }).click();
    await expect(page.locator(".pl-card")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "No programs match those filters." }),
    ).toBeVisible();
    await page
      .locator(".pl-empty")
      .getByRole("button", { name: "Reset filters" })
      .click();
    await page.getByRole("button", { name: "<45 min", exact: true }).click();
    await expect(page.locator(".pl-card")).toHaveCount(1);
    await expect(page.locator(".pl-card")).toContainText("Upper / Lower");
    await page
      .getByRole("button", { name: "Reset filters", exact: true })
      .click();
    await page.screenshot({
      path: "test-results/program-library-desktop.png",
      fullPage: true,
    });
    await page
      .locator(".pl-card")
      .first()
      .getByRole("link", { name: "Preview", exact: true })
      .click();
    await loaded(page);
    await expect(page.locator(".pl-exercise")).toHaveCount(3);
    await expect(page.locator(".pl-sidebar")).toContainText("8");
    await page
      .getByRole("button", { name: "Dumbbell goblet squat", exact: true })
      .click();
    await expect(
      page.locator(".pl-exercise").first().locator(".pl-exercise-name strong"),
    ).toHaveText("Dumbbell goblet squat");
    await page.reload();
    await loaded(page);
    await expect(
      page.locator(".pl-exercise").first().locator(".pl-exercise-name strong"),
    ).toHaveText("Dumbbell goblet squat");
    const beforeLog = await state(page.request);
    expect(
      beforeLog.preferences.find((p) => p.program_id === "FullBody").swaps[
        "0:0"
      ],
    ).toBe(0);
    await page
      .locator(".pl-exercise")
      .first()
      .getByRole("button", { name: "Set 1", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Log program set" });
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("button", { name: "Increase Weight (lb)", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Save set 1", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".pl-sidebar")).toContainText("1/8 sets");
    let current = await state(page.request),
      session = current.sessions.find((s) => s.program_id === "FullBody");
    expect(session.exercises[0].name).toBe("Dumbbell goblet squat");
    expect(session.sets).toHaveLength(1);
    expect(session.sets[0].weight_kg).toBeCloseTo(2.26796185, 7);
    expect(
      (
        await action(page.request, {
          action: "swap",
          programId: "FullBody",
          day: 0,
          exercise: 0,
          alternative: 1,
        })
      ).status(),
    ).toBe(409);
    await page.screenshot({
      path: "test-results/program-detail-desktop.png",
      fullPage: true,
    });
    other = await apiRequest.newContext();
    ids.push(await fixture(sql, other, "kg"));
    expect((await state(other)).preferences).toHaveLength(0);
    expect(
      (
        await action(other, {
          action: "log",
          sessionId: session.id,
          exercise: 0,
          set: 1,
          weightKg: 50,
          value: 5,
          rpe: 7,
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await action(other, { action: "complete", sessionId: session.id })
      ).status(),
    ).toBe(404);
    expect(
      (
        await page.request.post(origin + "/api/programs", {
          headers: { origin: "https://example.invalid" },
          data: { action: "bookmark", programId: "PPL", bookmarked: true },
        })
      ).status(),
    ).toBe(403);
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("link", { name: "Resume workout", exact: true })
      .click();
    await loaded(page);
    await expect(
      page.getByRole("heading", { name: "Dumbbell goblet squat", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Log set 2", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Increase Weight (lb)", exact: true })
      .click();
    let interrupted = false;
    await page.route("**/api/programs", async (route) => {
      const data = route.request().postDataJSON();
      if (data?.action === "log" && !interrupted) {
        interrupted = true;
        expect((await route.fetch()).ok()).toBe(true);
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Fixture interrupted save" }),
        });
      } else await route.continue();
    });
    await page.getByRole("button", { name: "Log set 2", exact: true }).click();
    await expect(page.locator(".pl-error")).toContainText(
      "Fixture interrupted save",
    );
    await page.getByRole("button", { name: "Log set 2", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Log set 3", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".pl-rest")).toBeVisible();
    await page.getByRole("button", { name: "+15s", exact: true }).click();
    await expect(page.locator(".pl-rest")).toContainText(/2:4\d/);
    await page.getByRole("button", { name: "Skip", exact: true }).click();
    await expect(page.locator(".pl-rest")).toHaveCount(0);
    await page.screenshot({
      path: "test-results/program-workout-mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".pl-workout button:not(:disabled)")
        .evaluateAll((es) =>
          es
            .filter((e) => e.getBoundingClientRect().height < 44)
            .map((e) => e.textContent),
        ),
    ).toEqual([]);
    await page.reload();
    await loaded(page);
    await expect(
      page.getByRole("button", { name: "Log set 3", exact: true }),
    ).toBeVisible();
    current = await state(page.request);
    session = current.sessions.find((s) => s.program_id === "FullBody");
    expect(session.sets).toHaveLength(2);
    const entryCount = (
      await sql`SELECT COUNT(*)::int n FROM firstrep_workout_entries WHERE user_id=${ids[0]}`
    )[0].n;
    expect(entryCount).toBe(2);
    for (let i = 0; i < session.exercises.length; i++)
      for (let j = 0; j < session.exercises[i].sets; j++) {
        if (
          session.sets.some(
            (s) => s.exercise_index === i && s.set_index === j,
          ) ||
          (i === 2 && j === 1)
        )
          continue;
        expect(
          (
            await action(page.request, {
              action: "log",
              sessionId: session.id,
              exercise: i,
              set: j,
              weightKg: 10,
              value: 5,
              rpe: 7,
            })
          ).ok(),
        ).toBe(true);
      }
    await page.reload();
    await loaded(page);
    await expect(
      page.getByRole("heading", { name: "Lat Pulldown", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Log set 2", exact: true }).click();
    await expect(
      page.getByText("WORKOUT COMPLETE", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".pl-total-sets")).toHaveText("8");
    await page
      .getByRole("link", { name: "View workout log", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Every rep counts.", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".ws-exercise-card")).toHaveCount(3);
    // Whole-log rewrites retain program sets through the deferred foreign key.
    const previous = (
        await (await page.request.get(origin + "/api/logs")).json()
      ).logs.workout,
      rows = previous.map((r, i) =>
        i === 0 ? { ...r, notes: r.notes + " edited", weight_kg: 42 } : r,
      );
    expect(
      (
        await page.request.put(origin + "/api/logs/workout", {
          headers: { origin },
          data: { previous, rows },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await state(page.request)).sessions.find((s) => s.id === session.id)
        .sets,
    ).toHaveLength(8);
    expect(
      (
        await sql`SELECT weight_kg FROM firstrep_program_sets WHERE workout_entry_id=${rows[0].id}`
      )[0].weight_kg,
    ).toBe(42);
    const remaining = rows.slice(1);
    expect(
      (
        await page.request.put(origin + "/api/logs/workout", {
          headers: { origin },
          data: { previous: rows, rows: remaining },
        })
      ).status(),
    ).toBe(200);
    const changed = (await state(page.request)).sessions.find(
      (s) => s.id === session.id,
    );
    expect(changed.sets).toHaveLength(7);
    expect(changed.completed_at).toBeNull();
    expect(
      (
        await action(page.request, {
          action: "log",
          sessionId: session.id,
          exercise: 0,
          set: 99,
          weightKg: 10,
          value: 5,
          rpe: 7,
        })
      ).status(),
    ).toBe(404);
    await page.goto(origin + "/programs/FullBody?day=2");
    await loaded(page);
    await page
      .getByRole("button", { name: "Mark day complete", exact: true })
      .click();
    await expect(page.locator(".pl-confirm")).toContainText(
      "Unlogged sets won’t be added.",
    );
    await page
      .getByRole("button", { name: "Confirm completion", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Day complete ✓", exact: true }),
    ).toBeDisabled();
    await page.getByRole("link", { name: "View workout", exact: true }).click();
    await expect(
      page.getByText("WORKOUT COMPLETE", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Next day · Full Body C", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Front Squat", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Exit workout", exact: true }).click();
    await expect(
      page.locator('.pl-day-tabs button[aria-pressed="true"]'),
    ).toContainText("Full Body C");
    expect(
      (
        await sql`SELECT COUNT(*)::int n FROM firstrep_workout_entries WHERE user_id=${ids[0]}`
      )[0].n,
    ).toBe(7);
    expect(errors).toEqual([]);
  } finally {
    if (other) await other.dispose();
    await clean(sql, ids);
  }
});
test("timed and distance sets persist as actual measurements and respect kg accounts", async ({
  page,
}) => {
  const sql = postgres(process.env.NEON_DATABASE_URL, {
      ssl: "require",
      max: 1,
    }),
    ids = [];
  try {
    ids.push(await fixture(sql, page.request, "kg"));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + "/programs/Cardio/workout/1");
    await loaded(page);
    await expect(
      page.getByRole("button", { name: "Increase Time (s)", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Increase Weight (kg)", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Increase Time (s)", exact: true })
      .click();
    await page.getByRole("button", { name: "Log set 1", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Log set 2", exact: true }),
    ).toBeVisible();
    let session = (await state(page.request)).sessions.find(
      (s) => s.program_id === "Cardio",
    );
    expect(session.sets[0].duration_seconds).toBe(75);
    expect(session.sets[0].reps).toBeNull();
    const duplicate = {
      action: "log",
      sessionId: session.id,
      exercise: 0,
      set: 1,
      weightKg: 0,
      value: 60,
      rpe: 7,
    };
    const results = await Promise.all([
      action(page.request, duplicate),
      action(page.request, duplicate),
    ]);
    expect(results.every((r) => r.ok())).toBe(true);
    expect(
      (await state(page.request)).sessions.find((s) => s.id === session.id)
        .sets,
    ).toHaveLength(2);
    expect(
      (
        await sql`SELECT COUNT(*)::int n FROM firstrep_workout_entries WHERE user_id=${ids[0]}`
      )[0].n,
    ).toBe(0);
    await page.goto(origin + "/programs/Cardio/workout/3");
    await loaded(page);
    await expect(
      page.getByRole("button", { name: "Increase Distance (m)", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Increase Distance (m)", exact: true })
      .click();
    await page.getByRole("button", { name: "Log set 1", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Log set 2", exact: true }),
    ).toBeVisible();
    session = (await state(page.request)).sessions.find(
      (s) => s.program_id === "Cardio" && s.day_index === 2,
    );
    expect(session.sets[0].distance_m).toBe(525);
  } finally {
    await clean(sql, ids);
  }
});
