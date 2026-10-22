import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";
const origin = process.env.AUTH_TEST_BASE_URL || "http://localhost:3025";
test.use({ viewport: { width: 1440, height: 1000 } });
test.setTimeout(180000);
test("achievement activity persists, awards are idempotent, and all catalog cards work on desktop and phone", async ({
  page,
}) => {
  const sql = postgres(process.env.NEON_DATABASE_URL, {
    ssl: "require",
    max: 1,
  });
  const id = randomUUID(),
    email = `firstrep-test-${id}@example.invalid`,
    password = `A!7${randomUUID()}z9`;
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    expect(
      (await page.request.get(origin + "/api/achievements")).status(),
    ).toBe(401);
    const hash = await hashPassword(password);
    await sql.begin(async (tx) => {
      await tx`INSERT INTO "user"(id,name,email,email_verified,onboarded,terms_version_accepted,terms_accepted_at,weight_unit,timezone) VALUES (${id},'Quest fixture',${email},true,true,'2026-10-02',NOW(),'lb','America/New_York')`;
      await tx`INSERT INTO firstrep_users(id,email,display_name,password_hash,password_salt,role) VALUES (${id},${email},'Quest fixture','','','customer')`;
      await tx`INSERT INTO account(id,account_id,provider_id,user_id,password,updated_at) VALUES (${randomUUID()},${id},'credential',${id},${hash},NOW())`;
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
    const post = async (data) => {
      const response = await page.request.post(origin + "/api/achievements", {
        headers: { origin },
        data,
      });
      expect(response.status(), await response.text()).toBe(200);
      return response.json();
    };
    let state = await post({ action: "sync" });
    expect(state.quests).toHaveLength(50);
    expect(state.badges).toHaveLength(50);
    expect(state.questXP).toBe(0);
    const run = {
      id: randomUUID(),
      kind: "run",
      date,
      miles: 2,
      seconds: 1100,
      mileSeconds: 540,
      splits: [540, 550],
    };
    state = await post(run);
    expect(state.quests.find((q) => q.id === "quest_28").complete).toBe(true);
    expect(state.quests.find((q) => q.id === "quest_16").complete).toBe(true);
    expect(state.badges.find((b) => b.id === "badge_01").earned).toBe(true);
    const xp = state.questXP;
    expect((await post(run)).questXP).toBe(xp);
    await post({ id: randomUUID(), kind: "mobility", date, minutes: 10 });
    await sql`INSERT INTO firstrep_bmi_readings(id,user_id,recorded_at,height_cm,weight_kg) VALUES (${randomUUID()},${id},${date + "T12:00:00Z"},180,90)`;
    for (const [exerciseId, exercise] of [
      ["Barbell_Squat", "Barbell Squat"],
      [
        "Barbell_Bench_Press_-_Medium_Grip",
        "Barbell Bench Press - Medium Grip",
      ],
      ["Barbell_Deadlift", "Barbell Deadlift"],
    ]) {
      await sql`INSERT INTO firstrep_workout_entries(id,user_id,date,exercise,exercise_id,sets,reps,weight_kg,rpe,notes,source) VALUES (${randomUUID()},${id},${date},${exercise},${exerciseId},1,1,200,8,'','voice')`;
    }
    for (const meal of ["breakfast", "lunch", "dinner"])
      await sql`INSERT INTO firstrep_food_entries(id,user_id,date,food,protein_g,carbs_g,fat_g,calories,meal) VALUES (${randomUUID()},${id},${date},'Fixture meal',50,50,10,500,${meal})`;
    state = await post({
      id: randomUUID(),
      kind: "nutrition",
      date,
      proteinTarget: 150,
      calorieTarget: 1500,
    });
    expect(state.quests.find((q) => q.id === "quest_06").complete).toBe(true);
    expect(state.quests.find((q) => q.id === "quest_08").complete).toBe(true);
    expect(state.quests.find((q) => q.id === "quest_47").complete).toBe(true);
    expect(state.badges.find((b) => b.id === "badge_28").earned).toBe(true);
    const before =
      await sql`SELECT count(*) AS count FROM firstrep_achievement_awards WHERE user_id=${id}`;
    await post({ action: "sync" });
    const after =
      await sql`SELECT count(*) AS count FROM firstrep_achievement_awards WHERE user_id=${id}`;
    expect(after[0].count).toBe(before[0].count);
    expect(
      (
        await page.request.post(origin + "/api/achievements", {
          headers: { origin: "https://other.invalid" },
          data: { action: "sync" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post(origin + "/api/achievements", {
          headers: { origin },
          data: {
            id: randomUUID(),
            kind: "run",
            date,
            miles: 1,
            seconds: 300,
            fiveKSeconds: 200,
          },
        })
      ).status(),
    ).toBe(400);
    await page.addInitScript(() =>
      sessionStorage.setItem("firstrep-splash-seen", "1"),
    );
    await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("navigation", { name: "Dashboard views" })
      .getByRole("button", { name: "Quests" })
      .click();
    await expect(page.locator(".dh-quest")).toHaveCount(50);
    await expect(page.locator(".dh-badge")).toHaveCount(50);
    await page
      .getByRole("combobox", { name: "Activity", exact: true })
      .selectOption("water");
    await page.getByLabel("Water logged (fl oz)").fill("24");
    await page.getByLabel("Daily water goal (fl oz)").fill("64");
    await page.getByRole("button", { name: "Save activity" }).click();
    await expect(page.getByText("Logged quest activity (4)")).toBeVisible();
    await page
      .getByRole("combobox", { name: "Tier", exact: true })
      .selectOption("5");
    await expect(page.locator(".dh-quest")).toHaveCount(10);
    await page.screenshot({
      path: "test-results/achievements-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: "test-results/achievements-phone.png",
      fullPage: true,
    });
    await page.reload();
    await page
      .getByRole("navigation", { name: "Quick dashboard navigation" })
      .getByRole("button", { name: "Quests", exact: true })
      .click();
    await expect(page.getByText("Logged quest activity (4)")).toBeVisible();
    await page.goto(origin + "/analysis", {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    for (const label of [
      "Most common exercise",
      "Weekly volume average",
      "Avg duration",
      "Average rep/set ratio",
    ])
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    await page.screenshot({
      path: "test-results/analysis-snapshot-phone.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await sql`DELETE FROM "user" WHERE id=${id}`;
    await sql.end();
  }
});
