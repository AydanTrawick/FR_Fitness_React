import { test, expect as baseExpect } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 20000 });
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";
import { sessionNotes } from "../lib/workout-session.ts";
const origin = process.env.AUTH_TEST_BASE_URL || "http://localhost:3025";
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(180000);
test("canonical library, custom live workout, muscle analysis and duration persist", async ({
  page,
}) => {
  const sql = postgres(process.env.NEON_DATABASE_URL, {
    ssl: "require",
    max: 1,
  });
  const userId = randomUUID(),
    email = `firstrep-test-${randomUUID()}@example.invalid`,
    password = `A!7${randomUUID()}z9`;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    const catalog = await (
      await page.request.get(origin + "/api/exercises?limit=1000")
    ).json();
    expect(catalog.exercises.length).toBeGreaterThan(800);
    expect(catalog.exercises.some((e) => e.id === "bench")).toBe(false);
    expect(
      catalog.exercises.find(
        (e) => e.id === "Barbell_Bench_Press_-_Medium_Grip",
      ).aliases,
    ).toContain("bench");
    expect(
      catalog.exercises.every(
        (e) => e.primary_muscle === e.primary_muscle.toLowerCase(),
      ),
    ).toBe(true);
    expect(
      catalog.exercises.find((e) => e.id === "assault-bike").primary_muscle,
    ).toBe("quadriceps");
    const hash = await hashPassword(password);
    await sql.begin(async (tx) => {
      await tx`INSERT INTO "user"(id,name,email,email_verified,onboarded,terms_version_accepted,terms_accepted_at,weight_unit) VALUES (${userId},'Exercise analysis fixture',${email},true,true,'2026-10-02',NOW(),'kg')`;
      await tx`INSERT INTO firstrep_users(id,email,display_name,password_hash,password_salt,role) VALUES (${userId},${email},'Exercise analysis fixture','','','customer')`;
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
    await expect(
      page.getByRole("button", { name: "Start workout", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    const setup = page.getByRole("dialog", { name: "Build your live session" });
    await setup
      .getByRole("searchbox", { name: "Find a session exercise" })
      .fill("My custom chest machine");
    await setup
      .getByLabel("Custom exercise target muscle")
      .selectOption("chest");
    await setup
      .getByLabel("Custom exercise movement (optional)")
      .selectOption("push");
    await setup
      .getByRole("button", { name: "Add custom exercise", exact: true })
      .click();
    await setup
      .getByRole("button", { name: /Start workout · 1 exercise/ })
      .click();
    const live = page.getByRole("dialog", { name: "Live workout session" });
    await expect(
      live.getByRole("heading", { name: "My custom chest machine" }),
    ).toBeVisible();
    await live
      .getByRole("button", { name: "Complete set 1", exact: true })
      .click();
    await live
      .getByRole("button", { name: "Finish workout", exact: true })
      .first()
      .click();
    await expect(live).not.toBeVisible();
    const rows = (await (await page.request.get(origin + "/api/logs")).json())
      .logs.workout;
    expect(rows).toHaveLength(1);
    expect(rows[0].exercise_id).toBe(null);
    expect(rows[0].notes).toContain('"targetMuscle":"chest"');
    expect(rows[0].notes).toContain('"durationSeconds":');
    // Verify a known session duration and legacy IDs using the same authenticated save path.
    const start = new Date(Date.now() - 60 * 60000).toISOString(),
      end = new Date().toISOString();
    const next = [
      ...rows,
      {
        id: randomUUID(),
        date: rows[0].date,
        exercise: "Barbell bench press",
        exercise_id: "bench",
        performed_at: end,
        sets: 3,
        reps: 8,
        weight_kg: 50,
        rpe: 7,
        notes: sessionNotes("", {
          id: "fixture-timed",
          name: "Timed fixture",
          unit: "kg",
          startedAt: start,
          endedAt: end,
          durationSeconds: 3300,
        }),
      },
    ];
    const save = await page.request.put(origin + "/api/logs/workout", {
      headers: { origin },
      data: { rows: next, previous: rows },
    });
    expect(save.ok(), await save.text()).toBe(true);
    expect(
      (
        await page.request.put(origin + "/api/library/favorites", {
          headers: { origin },
          data: { exerciseId: "bench", favorite: true },
        })
      ).ok(),
    ).toBe(true);
    const analysis = await (
      await page.request.get(
        origin + "/api/analysis?range=30d&tz=America%2FNew_York",
      )
    ).json();
    expect(analysis.metrics.snapshot.sessions).toBe(2);
    expect(
      analysis.metrics.library.find(
        (item) => item.id === "Barbell_Bench_Press_-_Medium_Grip",
      ).count,
    ).toBe(1);
    expect(analysis.metrics.snapshot.duration).toBeGreaterThanOrEqual(27.5);
    expect(analysis.metrics.snapshot.duration).toBeLessThan(29);
    expect(analysis.metrics.patterns.find((p) => p.name === "push").value).toBe(
      100,
    );
    expect(
      analysis.metrics.muscles.some((m) => m.name === "Unclassified"),
    ).toBe(false);
    const map = await (
      await page.request.get(origin + "/api/analysis/muscles?range=7d")
    ).json();
    expect(map.muscles.chest.sets).toBe(4);
    expect(map.muscles.triceps.sets).toBe(1.5);
    const mapLoaded = page.waitForResponse(
      (response) => response.url().includes("/api/analysis/muscles?range=7d"),
      { timeout: 60000 },
    );
    await page.goto(origin + "/analysis");
    expect((await mapLoaded).ok()).toBe(true);
    await expect(
      page.getByRole("heading", { name: "Time in the gym by day" }),
    ).toBeVisible();
    await expect(page.getByLabel("Muscle workload score legend")).toContainText(
      "workload points",
    );
    await page.screenshot({
      path: "test-results/exercise-analysis-mobile.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await sql`DELETE FROM "user" WHERE id=${userId}`;
    await sql`DELETE FROM firstrep_users WHERE id=${userId}`;
    await sql.end();
  }
});
