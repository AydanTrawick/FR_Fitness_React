import { test, expect as baseExpect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";
import sharp from "sharp";
import JSZip from "jszip";
const expect = baseExpect.configure({ timeout: 20000 });
const origin = process.env.AUTH_TEST_BASE_URL || "http://localhost:3026";
test.use({ viewport: { width: 1440, height: 1000 } });
test.setTimeout(120000);
test("workout and PR previews export branded PNGs; long sessions keep all cards", async ({
  page,
}) => {
  const sql = postgres(process.env.NEON_DATABASE_URL, {
    ssl: "require",
    max: 1,
  });
  const userId = randomUUID(),
    email = "firstrep-test-" + randomUUID() + "@example.invalid",
    password = "A!7" + randomUUID() + "z9";
  try {
    const hash = await hashPassword(password);
    await sql.begin(async (tx) => {
      await tx`INSERT INTO "user"(id,name,email,email_verified,onboarded,terms_version_accepted,terms_accepted_at,weight_unit) VALUES (${userId},'Card preview fixture',${email},true,true,'2026-10-02',NOW(),'lb')`;
      await tx`INSERT INTO firstrep_users(id,email,display_name,password_hash,password_salt,role) VALUES (${userId},${email},'Card preview fixture','','','customer')`;
      await tx`INSERT INTO firstrep_user_settings(user_id) VALUES (${userId})`;
      await tx`INSERT INTO account(id,account_id,provider_id,user_id,password,updated_at) VALUES (${randomUUID()},${userId},'credential',${userId},${hash},NOW())`;
      const lifts = [
        [
          "Bench press",
          [
            [8, 185],
            [8, 185],
            [6, 195],
          ],
        ],
        [
          "Incline DB press",
          [
            [9, 60],
            [10, 60],
            [9, 60],
          ],
        ],
        [
          "Overhead press",
          [
            [7, 95],
            [8, 95],
            [7, 95],
          ],
        ],
        [
          "Cable fly",
          [
            [12, 30],
            [12, 30],
          ],
        ],
        [
          "Tricep pushdown",
          [
            [10, 55],
            [12, 55],
            [10, 55],
          ],
        ],
      ];
      let index = 0;
      for (const [name, sets] of lifts)
        for (const [reps, weight] of sets) {
          await tx`INSERT INTO firstrep_workout_entries(id,user_id,date,exercise,sets,reps,weight_kg,rpe,notes,performed_at) VALUES (${randomUUID()},${userId},'2026-10-13',${name},1,${reps},${weight * 0.45359237},7,'',${new Date(Date.UTC(2026, 9, 13, 12, 0, index++)).toISOString()})`;
        }
      for (let i = 0; i < 70; i++)
        await tx`INSERT INTO firstrep_workout_entries(id,user_id,date,exercise,sets,reps,weight_kg,rpe,notes,performed_at) VALUES (${randomUUID()},${userId},'2026-10-12','Long session exercise',1,8,${20 + i},7,'',${new Date(Date.UTC(2026, 9, 12, 12, 0, i)).toISOString()})`;
    });
    await page.request.get(origin + "/api/auth/get-session");
    const login = await page.request.post(origin + "/api/auth/sign-in/email", {
      headers: { origin },
      data: { email, password },
    });
    if (!login.ok()) {
      const failure = await login.json().catch(() => ({}));
      throw new Error(
        "Fixture sign-in failed: " +
          login.status() +
          " " +
          (failure.code || failure.message || "no error code"),
      );
    }
    await page.goto(origin + "/#workout");
    await expect(
      page.getByRole("heading", { name: "Every rep counts." }),
    ).toBeVisible();
    await page
      .getByRole("status", { name: "Loading FirstRep Fitness" })
      .waitFor({ state: "detached", timeout: 10000 });
    const day = page.locator("#workout-day-2026-10-13");
    await expect(
      day
        .getByRole("button", { name: "Export CSV", exact: true })
        .locator("..")
        .getByRole("button", { name: "Share workout card", exact: true }),
    ).toBeVisible();
    await day
      .getByRole("button", { name: "Share workout card", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("combobox", { name: "Card date", exact: true })
      .selectOption("2026-10-13");
    await dialog.getByLabel("Workout title").fill("Push day");
    const downloadButton = dialog.getByRole("button", {
      name: "Download PNG card",
      exact: true,
    });
    await expect(downloadButton).toBeEnabled();
    const workoutDownload = page.waitForEvent("download");
    await downloadButton.click();
    const workoutFile = await workoutDownload;
    expect(workoutFile.suggestedFilename()).toBe(
      "firstrep-workout-2026-10-13.png",
    );
    await workoutFile.saveAs("test-results/workout-card.png");
    const workoutMeta = await sharp("test-results/workout-card.png").metadata();
    expect([workoutMeta.width, workoutMeta.height, workoutMeta.format]).toEqual(
      [1080, 2160, "png"],
    );
    await dialog.getByRole("button", { name: "Close card editor" }).click();
    await page
      .locator("#workout-day-2026-10-12")
      .getByRole("button", { name: "Share workout card", exact: true })
      .click();

    await expect(dialog.getByText(/Card 1 of [2-9]/)).toBeVisible();
    const zipDownload = page.waitForEvent("download");
    await dialog
      .getByRole("button", { name: /Download \d+ PNG cards/ })
      .click();
    const zipFile = await zipDownload;
    await zipFile.saveAs("test-results/workout-cards.zip");
    const zip = await JSZip.loadAsync(
      await (
        await import("node:fs/promises")
      ).readFile("test-results/workout-cards.zip"),
    );
    const pngs = Object.keys(zip.files).filter((name) => name.endsWith(".png"));
    expect(pngs.length).toBeGreaterThan(1);
    for (const name of pngs)
      expect(
        (await sharp(await zip.file(name).async("nodebuffer")).metadata())
          .height,
      ).toBe(2160);
    await dialog.getByRole("button", { name: "Close card editor" }).click();
    await page.getByRole("button", { name: "New PR", exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: "Download PNG card", exact: true }),
    ).toBeDisabled();
    await dialog.getByLabel("PR reps", { exact: true }).fill("2");
    await dialog.getByLabel("PR weight", { exact: true }).fill("405");
    await dialog
      .getByRole("combobox", { name: "Card weight unit", exact: true })
      .selectOption("lb");
    await dialog
      .getByLabel("Previous PR at the same reps (optional)")
      .fill("410");
    await expect(
      dialog.getByRole("button", { name: "Download PNG card", exact: true }),
    ).toBeDisabled();
    await dialog
      .getByLabel("Previous PR at the same reps (optional)")
      .fill("395");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const prDownload = page.waitForEvent("download");
    await dialog
      .getByRole("button", { name: "Download PNG card", exact: true })
      .click();
    const prFile = await prDownload;
    await prFile.saveAs("test-results/pr-card.png");
    const prMeta = await sharp("test-results/pr-card.png").metadata();
    expect([prMeta.width, prMeta.height]).toEqual([1080, 2160]);
    await dialog.getByRole("button", { name: "Close card editor" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const result = await page.request.get(origin + "/api/logs");
    expect((await result.json()).logs.workout.length).toBe(84);
  } finally {
    await sql`DELETE FROM "user" WHERE id=${userId}`;
    await sql`DELETE FROM firstrep_users WHERE id=${userId}`;
    await sql.end();
  }
});
