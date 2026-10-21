import { test, expect as baseExpect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";
import sharp from "sharp";
import { readSessionNote } from "../lib/workout-session.ts";
const origin = process.env.AUTH_TEST_BASE_URL || "http://localhost:3026";
const expect = baseExpect.configure({ timeout: 20000 });
test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
test.setTimeout(150000);
test("feelings save immediately after finishing and stay with each session", async ({
  page,
}) => {
  const sql = postgres(process.env.NEON_DATABASE_URL, {
    ssl: "require",
    max: 1,
  });
  const userId = randomUUID();
  const email = "firstrep-test-" + randomUUID() + "@example.invalid";
  const password = "A!7" + randomUUID() + "z9";
  const sessionIds = [randomUUID(), randomUUID()];
  try {
    const hash = await hashPassword(password);
    await sql.begin(async (tx) => {
      await tx`INSERT INTO "user"(id,name,email,email_verified,onboarded,terms_version_accepted,terms_accepted_at) VALUES (${userId},'Feeling fixture',${email},true,true,'2026-10-02',NOW())`;
      await tx`INSERT INTO firstrep_users(id,email,display_name,password_hash,password_salt,role) VALUES (${userId},${email},'Feeling fixture','','','customer')`;
      await tx`INSERT INTO firstrep_user_settings(user_id) VALUES (${userId})`;
      await tx`INSERT INTO account(id,account_id,provider_id,user_id,password,updated_at) VALUES (${randomUUID()},${userId},'credential',${userId},${hash},NOW())`;
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
    await page.goto(origin + "/#workout");
    const { exercises } = await (
      await page.request.get(origin + "/api/exercises?limit=1000")
    ).json();
    const exercise = exercises.find((e) => !e.metadata?.timed);
    expect(exercise).toBeTruthy();
    for (const [index, id] of sessionIds.entries()) {
      const startedAt = new Date().toISOString();
      await page.evaluate(
        ({ userId, draft }) => {
          sessionStorage.setItem(
            "firstrep.live-workout.v1." + userId,
            JSON.stringify(draft),
          );
        },
        {
          userId,
          draft: {
            id,
            name: `Feeling session ${index + 1}`,
            date: startedAt.slice(0, 10),
            unit: "kg",
            startedAt,
            current: 0,
            selected: 0,
            restEndsAt: null,
            restLength: 90,
            exercises: [
              {
                id: exercise.id,
                key: exercise.id,
                name: exercise.name,
                muscle: "Chest",
                bodyweight: false,
                rest: 90,
                sets: [0, 1].map(() => ({
                  id: randomUUID(),
                  weightKg: 20,
                  reps: 8,
                  rpe: 7,
                  done: true,
                  completedAt: startedAt,
                })),
              },
            ],
          },
        },
      );
      await page.reload();
      await page
        .getByRole("button", { name: "Resume workout", exact: true })
        .click();
      const live = page.getByRole("dialog", { name: "Live workout session" });
      await live
        .getByRole("button", { name: "Finish workout", exact: true })
        .first()
        .click();
      const recap = page.getByRole("dialog", { name: "Workout session recap" });
      await expect(recap).toBeVisible();
      const feeling = index === 0 ? "Solid" : "Rough";
      const saving = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/logs/workout") &&
          r.request().method() === "PUT",
      );
      await recap.getByRole("button", { name: feeling, exact: true }).click();
      const response = await saving;
      expect(response.status(), await response.text()).toBe(200);
      await expect(
        recap.getByRole("button", { name: feeling, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      if (index === 0) {
        // A failed update must leave the saved feeling intact and allow retry.
        await page.route(
          "**/api/logs/workout",
          (route) =>
            route.fulfill({
              status: 503,
              json: { error: "Temporary save failure" },
            }),
          { times: 1 },
        );
        await recap
          .getByRole("button", { name: "Strong", exact: true })
          .click();
        await expect(recap.getByRole("alert")).toContainText(
          "Your feeling could not be saved",
        );
        await expect(
          recap.getByRole("button", { name: "Solid", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        await recap
          .getByRole("button", { name: "Strong", exact: true })
          .click();
        await expect(
          recap.getByText("Saved to session notes: Strong", { exact: true }),
        ).toBeVisible();
      }
      await recap.getByRole("button", { name: "Done", exact: true }).click();
    }
    const rows =
      await sql`SELECT notes FROM firstrep_workout_entries WHERE user_id=${userId}`;
    expect(rows).toHaveLength(4);
    for (const [index, id] of sessionIds.entries()) {
      const notes = rows
        .map((row) => readSessionNote(row.notes))
        .filter((note) => note.id === id);
      expect(notes).toHaveLength(2);
      expect(
        notes.every(
          (note) => note.feeling === (index === 0 ? "Strong" : "Rough"),
        ),
      ).toBe(true);
    }
    await page.reload();
    await expect(
      page.getByText("Feeling session 1 · Felt Strong", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Feeling session 2 · Felt Rough", { exact: true }),
    ).toBeVisible();
  } finally {
    await sql`DELETE FROM "user" WHERE id=${userId}`;
    await sql`DELETE FROM firstrep_users WHERE id=${userId}`;
    await sql.end();
  }
});
test("grouped units, live draft, save recovery, recap, PR, feeling and weekly goal persist", async ({
  page,
}) => {
  const sql = postgres(process.env.NEON_DATABASE_URL, {
      ssl: "require",
      max: 1,
    }),
    userId = randomUUID(),
    email = "firstrep-test-" + randomUUID() + "@example.invalid",
    password = "A!7" + randomUUID() + "z9",
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const date = new Date().toLocaleDateString("en-CA"),
    prior = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
  const toKg = (lb) => lb * 0.45359237;
  try {
    expect(
      (await page.request.get(origin + "/api/workout-settings")).status(),
    ).toBe(401);
    const data = await (
      await page.request.get(origin + "/api/exercises?limit=1000")
    ).json();
    const bench = data.exercises.find((e) => e.name === "Barbell bench press"),
      pull = data.exercises.find((e) => e.id === "pullups"),
      hammer = data.exercises.find((e) => e.id === "hammer");
    expect(bench).toBeTruthy();
    expect(pull).toBeTruthy();
    expect(hammer).toBeTruthy();
    const hash = await hashPassword(password);
    await sql.begin(async (tx) => {
      await tx`INSERT INTO "user"(id,name,email,email_verified,onboarded,terms_version_accepted,terms_accepted_at,weight_unit) VALUES (${userId},'Live workout fixture',${email},true,true,'2026-10-02',NOW(),'lb')`;
      await tx`INSERT INTO firstrep_users(id,email,display_name,password_hash,password_salt,role) VALUES (${userId},${email},'Live workout fixture','','','customer')`;
      await tx`INSERT INTO firstrep_user_settings(user_id,preferences) VALUES (${userId},'{"weeklyWorkoutGoal":3,"analyticsOptIn":true,"workoutEmail":true}'::jsonb)`;
      await tx`INSERT INTO account(id,account_id,provider_id,user_id,password,updated_at) VALUES (${randomUUID()},${userId},'credential',${userId},${hash},NOW())`;
      for (const [d, lift, weight, reps, sets, hour] of [
        [prior, bench, 100, 8, 1, 10],
        [date, bench, 100, 8, 1, 10],
        [date, bench, 110, 6, 1, 11],
        [date, pull, 30, 10, 2, 12],
      ])
        await tx`INSERT INTO firstrep_workout_entries(id,user_id,date,exercise,exercise_id,sets,reps,weight_kg,rpe,notes,performed_at) VALUES (${randomUUID()},${userId},${d},${lift.name},${lift.id},${sets},${reps},${toKg(weight)},7,'Fixture human note',${d + "T" + hour + ":00:00Z"})`;
    });
    await page.request.get(origin + "/api/auth/get-session");
    const login = await page.request.post(origin + "/api/auth/sign-in/email", {
      headers: { origin },
      data: { email, password },
    });
    expect(login.ok()).toBe(true);
    await page.goto(origin + "/#workout");
    await expect(
      page.getByRole("heading", { name: "Every rep counts." }),
    ).toBeVisible();
    await page
      .getByRole("status", { name: "Loading FirstRep Fitness" })
      .waitFor({ state: "detached", timeout: 10000 });
    const day = page.locator("#workout-day-" + date);
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(day.locator(".ws-exercise-card")).toHaveCount(2);
    await expect(day.locator(".ws-session-stats")).toContainText("2,060");
    await expect(day.locator(".ws-set-chips").last()).toContainText("+30 × 10");
    await page
      .locator(".ws-muscle-filters")
      .getByRole("button", { name: "kg", exact: true })
      .click();
    await expect(day.locator(".ws-session-stats")).toContainText("934.4");
    await expect(
      day.locator(".ws-exercise-card").filter({
        has: page.getByRole("heading", { name: "Pull-up", exact: true }),
      }),
    ).toContainText("272.16");
    await page
      .locator(".ws-muscle-filters")
      .getByRole("button", { name: "Back", exact: true })
      .click();
    await expect(day.locator(".ws-exercise-card")).toHaveCount(1);
    await expect(day.locator(".ws-session-stats")).toContainText("272.2");
    await page
      .locator(".ws-muscle-filters")
      .getByRole("button", { name: "lb", exact: true })
      .click();
    await expect(day.locator(".ws-session-stats")).toContainText("600");
    await page
      .locator(".ws-muscle-filters")
      .getByRole("button", { name: "All", exact: true })
      .click();
    await page.screenshot({
      path: "test-results/workout-grouped.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Edit weekly session goal" })
      .click();
    await page.getByLabel("Weekly session goal", { exact: true }).fill("4");
    await page.getByRole("button", { name: "Save goal", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Edit weekly session goal" }),
    ).toContainText("of 4");
    const invalidGoal = await page.request.patch(
      origin + "/api/workout-settings",
      { headers: { origin }, data: { weeklyWorkoutGoal: 15 } },
    );
    expect(invalidGoal.status()).toBe(400);
    const crossOrigin = await page.request.patch(
      origin + "/api/workout-settings",
      {
        headers: { origin: "https://example.invalid" },
        data: { weeklyWorkoutGoal: 9 },
      },
    );
    expect(crossOrigin.status()).toBe(403);
    const prefs = (
      await sql`SELECT preferences FROM firstrep_user_settings WHERE user_id=${userId}`
    )[0].preferences;
    expect(prefs.weeklyWorkoutGoal).toBe(4);
    expect(prefs.analyticsOptIn).toBe(true);
    expect(prefs.workoutEmail).toBe(true);
    await page
      .getByRole("button", { name: "Baselines & progress", exact: true })
      .click();
    await expect(page.locator(".ws-record-card")).toHaveCount(2);
    await expect(
      page
        .locator(".ws-record-card")
        .filter({ hasText: "Barbell bench press" }),
    ).toContainText("132");
    await page.screenshot({
      path: "test-results/workout-progress.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Sessions", exact: true }).click();
    await page
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    const setup = page.getByRole("dialog", { name: "Build your live session" });
    await setup
      .getByRole("textbox", { name: "Session name" })
      .fill("Upper body rhythm");
    for (const lift of [bench, hammer]) {
      await setup
        .getByRole("searchbox", { name: "Find a session exercise" })
        .fill(lift.name);
      await setup
        .locator(".ws-catalog-results")
        .getByRole("button", { name: lift.name, exact: true })
        .click();
    }
    await expect(setup.locator(".ws-queue")).toContainText("1 set planned");
    await setup
      .getByRole("button", { name: "Start workout · 2 exercises", exact: true })
      .click();
    let live = page.getByRole("dialog", { name: "Live workout session" });
    await expect(live).toBeVisible();
    await live
      .getByRole("button", { name: "Pause workout timer", exact: true })
      .click();
    const frozen = await live
      .getByLabel("Elapsed workout time", { exact: true })
      .textContent();
    await page.waitForTimeout(1300);
    await expect(
      live.getByLabel("Elapsed workout time", { exact: true }),
    ).toHaveText(frozen);
    page.once("dialog", (dialog) => dialog.accept());
    await page.reload();
    await page
      .getByRole("button", { name: "Resume workout", exact: true })
      .click();
    live = page.getByRole("dialog", { name: "Live workout session" });
    await expect(
      live.getByRole("button", { name: "Resume workout timer", exact: true }),
    ).toBeVisible();
    await expect(
      live.getByLabel("Elapsed workout time", { exact: true }),
    ).toHaveText(frozen);
    await live
      .getByRole("button", { name: "Resume workout timer", exact: true })
      .click();
    await expect
      .poll(() =>
        live.getByLabel("Elapsed workout time", { exact: true }).textContent(),
      )
      .not.toBe(frozen);
    await expect(live.locator(".ws-effort button")).toHaveCount(10);
    await expect(live.locator(".ws-last-time")).toContainText("1 × 6 @ 110 lb");
    await expect(live.locator(".ws-live-sets .ws-set-row")).toHaveCount(1);
    await live
      .getByRole("button", { name: "Increase Weight (lb)", exact: true })
      .click();
    await live
      .getByRole("spinbutton", { name: "Weight (lb)", exact: true })
      .fill("112.5");
    await live.getByRole("button", { name: "RPE 1", exact: true }).click();
    await live
      .getByRole("button", { name: "Complete set 1", exact: true })
      .click();
    await expect(
      live.getByRole("button", { name: "Undo set 1", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(live.getByRole("timer")).toHaveText(/01:[23]\d/);
    await live.getByRole("button", { name: "+30s", exact: true }).click();
    await expect(live.getByRole("timer")).toHaveText(/0[12]:[05]\d/);
    await live.getByRole("button", { name: "Skip", exact: true }).click();
    await expect(live.getByRole("timer")).toHaveText("00:00");
    await live.getByRole("button", { name: "Add set", exact: true }).click();
    await live
      .getByRole("button", { name: "Increase Weight (lb)", exact: true })
      .click();
    await live.getByRole("button", { name: "RPE 10", exact: true }).click();
    await live
      .getByRole("button", { name: "Increase Reps", exact: true })
      .click();
    await live
      .getByRole("button", {
        name: "Complete set 2 by tapping row",
        exact: true,
      })
      .click();
    await live.getByRole("button", { name: "Add set", exact: true }).click();
    await live.getByRole("button", { name: "Back to workout log" }).click();
    await expect(
      page.getByRole("button", { name: "Resume workout", exact: true }),
    ).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Every rep counts." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Resume workout", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Resume workout", exact: true })
      .click();
    live = page.getByRole("dialog", { name: "Live workout session" });
    await expect(live.locator(".ws-live-sets .ws-set-row")).toHaveCount(3);
    await expect(live.locator(".ws-progress-label")).toContainText(
      "2 of 4 sets done",
    );
    expect(await live.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    const smallTargets = await live
      .getByRole("button")
      .evaluateAll((elements) =>
        elements
          .filter(
            (el) => !el.disabled && el.getBoundingClientRect().height < 44,
          )
          .map((el) => el.textContent),
      );
    expect(smallTargets).toEqual([]);
    await page.screenshot({
      path: "test-results/workout-live.png",
      fullPage: false,
    });
    await live.getByRole("button", { name: "Next", exact: true }).click();
    await expect(live.locator(".workout-encouragement")).toContainText(
      "Keep going!",
    );
    await expect(live.locator(".workout-encouragement")).toHaveCount(0);
    await live
      .getByRole("button", { name: "Increase Weight (lb)", exact: true })
      .click();
    await live
      .getByRole("button", { name: "Complete set 1", exact: true })
      .click();
    let attempts = 0;
    await page.route("**/api/logs/workout", async (route) => {
      if (route.request().method() === "PUT" && ++attempts <= 2) {
        if (attempts === 2) expect((await route.fetch()).ok()).toBe(true);
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Fixture save interruption" }),
        });
      } else await route.continue();
    });
    await live
      .getByRole("button", { name: "Finish workout", exact: true })
      .first()
      .click();
    await live
      .getByRole("button", {
        name: "Save completed sets & finish",
        exact: true,
      })
      .click();
    await expect(
      live
        .getByRole("alert")
        .filter({ hasText: "Your workout could not be saved" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        Object.keys(sessionStorage).some(
          (k) =>
            k.startsWith("firstrep.live-workout.v1.") && !k.endsWith(".goal"),
        ),
      ),
    ).toBe(true);
    await live
      .getByRole("button", {
        name: "Save completed sets & finish",
        exact: true,
      })
      .click();
    await expect
      .poll(
        async () =>
          (await (await page.request.get(origin + "/api/logs")).json()).logs
            .workout.length,
      )
      .toBe(7);
    await expect(live).toBeVisible();
    await expect(
      live.getByRole("button", {
        name: "Save completed sets & finish",
        exact: true,
      }),
    ).toBeEnabled();
    page.once("dialog", (dialog) => dialog.accept());
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Resume workout", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Resume workout", exact: true })
      .click();
    live = page.getByRole("dialog", { name: "Live workout session" });
    await live
      .getByRole("button", { name: "Finish workout", exact: true })
      .first()
      .click();
    await live
      .getByRole("button", {
        name: "Save completed sets & finish",
        exact: true,
      })
      .click();
    const pr = page.getByRole("dialog", { name: "New personal record" });
    await expect(pr).toBeVisible();
    await expect(pr.getByLabel("PR weight", { exact: true })).toHaveValue(
      "117.5",
    );
    await expect(pr.getByLabel("PR reps", { exact: true })).toHaveValue("7");
    await pr.getByRole("button", { name: "Close card editor" }).click();
    const recap = page.getByRole("dialog", { name: "Workout session recap" });
    await expect(recap).toBeVisible();
    await expect(recap.locator(".ws-recap-volume > strong")).toBeInViewport();
    await expect(recap.locator(".ws-recap-stats")).toContainText(
      "3sets2exercises21reps",
    );
    await expect(recap.locator(".ws-recap-volume > strong")).toHaveText(
      "1,537.5",
    );
    await expect(
      recap.getByRole("heading", { name: "1 baseline set", exact: true }),
    ).toBeVisible();
    await recap.getByRole("button", { name: "Solid", exact: true }).click();
    await expect(
      recap.getByText("Saved to session notes: Solid", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/workout-recap.png",
      fullPage: false,
    });
    await recap
      .getByRole("button", { name: "Share workout card", exact: true })
      .click();
    const card = page.getByRole("dialog", { name: "Your workout card" });
    await expect(card.getByLabel("Workout title")).toHaveValue(
      "Upper body rhythm",
    );
    const downloading = page.waitForEvent("download");
    await card
      .getByRole("button", { name: "Download PNG card", exact: true })
      .click();
    await (await downloading).saveAs("test-results/live-session-card.png");
    const meta = await sharp("test-results/live-session-card.png").metadata();
    expect([meta.width, meta.height]).toEqual([1080, 2160]);
    await card.getByRole("button", { name: "Close card editor" }).click();
    await recap.getByRole("button", { name: "Done", exact: true }).click();
    const saved = (await (await page.request.get(origin + "/api/logs")).json())
      .logs.workout;
    expect(saved.length).toBe(7);
    const newest = saved.filter((r) =>
      String(r.notes).includes("Upper body rhythm"),
    );
    expect(newest.length).toBe(3);
    expect(
      newest.every((r) => String(r.notes).includes('"feeling":"Solid"')),
    ).toBe(true);
    expect(
      newest
        .map((r) => Math.round((Number(r.weight_kg) / 0.45359237) * 10) / 10)
        .sort((a, b) => a - b),
    ).toEqual([5, 112.5, 117.5]);
    expect(newest.map((r) => Number(r.rpe)).sort((a, b) => a - b)).toEqual([
      1, 7, 10,
    ]);
    expect(saved.filter((r) => r.notes === "Fixture human note").length).toBe(
      4,
    );
    await page.reload();
    await expect(
      page.getByText("Upper body rhythm · Felt Solid", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Edit weekly session goal" }),
    ).toContainText("of 4");
    expect(errors).toEqual([]);
  } finally {
    await sql`DELETE FROM "user" WHERE id=${userId}`;
    await sql`DELETE FROM firstrep_users WHERE id=${userId}`;
    await sql.end();
  }
});
