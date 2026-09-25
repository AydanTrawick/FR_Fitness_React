import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { scoreMuscles, colorBucket } from "../lib/muscle-heatmap.ts";

if (!process.env.NEON_DATABASE_URL) throw new Error("NEON_DATABASE_URL is required.");
const sql = postgres(process.env.NEON_DATABASE_URL, { ssl: "require", max: 1 });
const marker = "HEATMAP_VERIFIED_ROLLBACK";
const suffix = randomUUID();
const userId = `heatmap-test-${suffix}`;
const benchId = "Barbell_Bench_Press_-_Medium_Grip";
const squatId = "Barbell_Squat";
try {
  await sql.begin(async (tx) => {
    const exercises = await tx`SELECT id FROM exercises WHERE id IN (${benchId},${squatId})`;
    assert.equal(exercises.length, 2, "Seed the upstream exercise catalog before verification.");
    await tx`INSERT INTO firstrep_users(id,email,display_name,password_hash,password_salt)
      VALUES(${userId},${`heatmap-${suffix}@invalid.example`},'Heatmap test','not-a-login','not-a-login')`;
    await tx`INSERT INTO firstrep_workout_entries(user_id,date,exercise,exercise_id,sets,reps,weight_kg,rpe,performed_at)
      VALUES(${userId},current_date,'Barbell Bench Press - Medium Grip',${benchId},4,8,100,7,now())`;
    await tx`INSERT INTO firstrep_workout_entries(user_id,date,exercise,exercise_id,sets,reps,weight_kg,rpe,performed_at)
      VALUES(${userId},current_date,'Barbell Squat',${squatId},3,5,100,7,now())`;
    const rows = await tx`
      SELECT e.name, e.primary_muscles, e.secondary_muscles, w.sets
      FROM firstrep_workout_entries w JOIN exercises e ON e.id=w.exercise_id
      WHERE w.user_id=${userId} AND w.performed_at >= now() - 7 * interval '1 day'`;
    const muscles = scoreMuscles(rows);
    assert.equal(muscles.chest.sets, 4);
    assert.equal(muscles.triceps.sets, 2);
    assert.equal(muscles.shoulders.sets, 2);
    assert.equal(muscles.quadriceps.sets, 3);
    assert.equal(muscles.glutes.sets, 1.5);
    assert.equal(muscles.calves.sets, 1.5);
    assert.equal(muscles.hamstrings.sets, 1.5);
    assert.equal(muscles["lower back"].sets, 1.5);
    assert.equal(colorBucket(muscles.chest.sets, "7d"), 1);
    assert.equal(colorBucket(muscles.quadriceps.sets, "7d"), 1);
    throw new Error(marker);
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== marker) throw error;
  console.log("Verified scoped bench/squat muscle credits against seeded exercises and light color buckets. Test user and logs rolled back.");
} finally {
  await sql.end();
}
