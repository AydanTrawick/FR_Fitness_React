import { test, expect as baseExpect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";
const origin = process.env.AUTH_TEST_BASE_URL || "http://localhost:3026";
test.use({ viewport: { width: 1440, height: 1000 } });
test.setTimeout(120000);
const expect = baseExpect.configure({ timeout: 20000 });
test("workout sets start at one and persist individual weights and reps", async ({
  page,
}) => {
  const sql = postgres(process.env.NEON_DATABASE_URL, {
    ssl: "require",
    max: 1,
  });
  const email = `firstrep-test-${randomUUID()}@example.invalid`;
  const password = `A!7${randomUUID()}z9`;
  try {
    const userId = randomUUID();
    const hash = await hashPassword(password);
    await sql.begin(async (tx) => {
      await tx`INSERT INTO "user"(id,name,email,email_verified,onboarded,terms_version_accepted,terms_accepted_at) VALUES (${userId},'Workout set fixture',${email},true,true,'2026-10-02',NOW())`;
      await tx`INSERT INTO firstrep_users(id,email,display_name,password_hash,password_salt,role) VALUES (${userId},${email},'Workout set fixture','','','customer')`;
      await tx`INSERT INTO firstrep_user_settings(user_id) VALUES (${userId})`;
      await tx`INSERT INTO account(id,account_id,provider_id,user_id,password,updated_at) VALUES (${randomUUID()},${userId},'credential',${userId},${hash},NOW())`;
    });
    const login = await page.request.post(origin + "/api/auth/sign-in/email", {
      headers: { origin },
      data: { email, password },
    });
    expect(login.ok()).toBe(true);
    await page.goto(origin + "/#workout");
    await expect(
      page.getByRole("heading", { name: "Every rep counts." }),
    ).toBeVisible({ timeout: 20000 });
    await page
      .getByRole("status", { name: "Loading FirstRep Fitness" })
      .waitFor({ state: "detached", timeout: 10000 });
    await expect(
      page.getByRole("group", { name: "Set 1", exact: true }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("group", { name: "Set 2", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("combobox", { name: "Exercise", exact: true })
      .fill("Barbell bench press");
    await page
      .getByRole("combobox", { name: "Weight unit", exact: true })
      .selectOption("lb");
    await page.getByLabel("Set 1 weight (lb)").fill("100");
    await page.getByLabel("Set 1 reps", { exact: true }).fill("8");
    await page.getByRole("button", { name: "Add set", exact: true }).click();
    await expect(page.getByLabel("Set 2 weight (lb)")).toHaveValue("100");
    await page.getByLabel("Set 2 weight (lb)").fill("120");
    await page.getByLabel("Set 2 reps", { exact: true }).fill("6");
    await page.getByRole("button", { name: "Add set", exact: true }).click();
    await page.getByLabel("Set 3 weight (lb)").fill("130");
    await page
      .getByRole("button", { name: "Remove set 2", exact: true })
      .click();
    await expect(page.getByLabel("Set 2 weight (lb)")).toHaveValue("130");
    await expect(page.getByLabel("Set 1 weight (lb)")).toHaveValue("100");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByLabel("Set 2 weight (lb)")).toBeVisible({
      timeout: 20000,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Save 2 sets", exact: true })
      .click();
    await expect(
      page.getByText("Saved to your account.", { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole("button", { name: "Save 1 set", exact: true }),
    ).toBeVisible({ timeout: 20000 });
    const result = await page.request.get(origin + "/api/logs");
    const { logs } = await result.json();
    expect(logs.workout).toHaveLength(2);
    const rows = [...logs.workout].sort(
      (a, b) => Number(a.weight_kg) - Number(b.weight_kg),
    );
    expect(Number(rows[0].weight_kg)).toBeCloseTo(45.359237, 4);
    expect(Number(rows[1].weight_kg)).toBeCloseTo(58.9670081, 4);
    expect(rows.map((row) => Number(row.reps))).toEqual([8, 6]);
    expect(rows.map((row) => Number(row.sets))).toEqual([1, 1]);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Every rep counts." }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByText("total sets", { exact: true }).locator(".."),
    ).toContainText("2");
  } finally {
    await sql`DELETE FROM "user" WHERE email=${email}`;
    await sql`DELETE FROM firstrep_users WHERE email=${email}`;
    await sql.end();
  }
});
