import { test, expect } from "@playwright/test";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";

const origin = process.env.TEST_BASE_URL ?? "http://localhost:3055";
test.setTimeout(90000);
test.use({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", viewport: { width: 1440, height: 1000 } });

test("authenticated muscle map shows scoped scores, colors, details and mobile layout", async ({ page }) => {
  const sql = postgres(process.env.NEON_DATABASE_URL, { ssl: "require", max: 1 });
  const suffix = randomUUID();
  const userId = `heatmap-browser-${suffix}`;
  const token = randomBytes(32).toString("base64url");
  try {
    await sql`INSERT INTO firstrep_users(id,email,display_name,password_hash,password_salt)
      VALUES(${userId},${`heatmap-browser-${suffix}@invalid.example`},'Heatmap browser test','not-a-login','not-a-login')`;
    await sql`INSERT INTO firstrep_login_sessions(token_hash,user_id,expires_at)
      VALUES(${createHash("sha256").update(token).digest("hex")},${userId},now() + interval '1 hour')`;
    await sql`INSERT INTO firstrep_workout_entries(user_id,date,exercise,exercise_id,sets,reps,weight_kg,rpe,performed_at)
      VALUES(${userId},current_date,'Barbell Bench Press - Medium Grip','Barbell_Bench_Press_-_Medium_Grip',4,8,100,7,now())`;
    await sql`INSERT INTO firstrep_workout_entries(user_id,date,exercise,exercise_id,sets,reps,weight_kg,rpe,performed_at)
      VALUES(${userId},current_date,'Barbell Squat','Barbell_Squat',3,5,100,7,now())`;

    await page.context().addCookies([{ name: "firstrep_session", value: token, url: origin }]);
    const api = await page.request.get(`${origin}/api/analysis/muscles?range=7d`);
    expect(api.ok()).toBeTruthy();
    const body = await api.json();
    expect(body.muscles.chest.sets).toBe(4);
    expect(body.muscles.triceps.sets).toBe(2);
    expect(body.muscles.shoulders.sets).toBe(2);
    expect(body.muscles.quadriceps.sets).toBe(3);
    expect(body.muscles.glutes.sets).toBe(1.5);

    await page.goto(`${origin}/analysis`);
    await expect(page.getByRole("heading", { name: "Muscle map" })).toBeVisible();
    await expect(page.locator('[data-testid="model-anterior"]')).toBeVisible();
    await expect(page.locator('[data-testid="model-posterior"]')).toBeVisible();
    await expect(page.locator('[data-testid="muscle-left-chest"]').first()).toHaveCSS("fill", "rgb(201, 229, 166)");
    await page.locator('[data-testid="muscle-left-chest"]').first().click();
    await expect(page.getByText("4 credited sets in 7d")).toBeVisible();
    await expect(page.getByText("Barbell Bench Press - Medium Grip").last()).toBeVisible();
    await page.getByRole("group", { name: "Muscle map date range" }).getByRole("button", { name: "30d" }).click();
    await expect(page.getByRole("heading", { name: "Muscle map" })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    const front = await page.locator(".muscle-view").first().boundingBox();
    const back = await page.locator(".muscle-view").last().boundingBox();
    expect(front && back && back.y >= front.y + front.height).toBeTruthy();
  } finally {
    await sql`DELETE FROM firstrep_users WHERE id=${userId}`;
    await sql.end();
  }
});
