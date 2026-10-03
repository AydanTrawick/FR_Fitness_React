import { db } from "@/lib/database";
import { accountMail } from "./mail";
import JSZip from "jszip";
const origin = () => process.env.BETTER_AUTH_URL || "http://localhost:3000";
export async function audit(userId: string, event: string, request: Request) {
  await db()`INSERT INTO firstrep_audit_log(user_id,event,ip,user_agent) VALUES (${userId},${event},${request.headers.get("x-forwarded-for")?.split(",")[0]?.slice(0, 100) || ""},${request.headers.get("user-agent")?.slice(0, 500) || ""})`;
}
export async function exportUserData(userId: string) {
  const sql = db();
  const users =
    await sql`SELECT id,name,email,email_verified,image,created_at,username,bio,weight_unit,distance_unit,timezone,goal,terms_version_accepted,terms_accepted_at FROM "user" WHERE id=${userId} AND deleted_at IS NULL`;
  if (!users[0]) throw new Error("Account unavailable.");
  const data: Record<string, readonly unknown[]> = { profile: [users[0]] };
  const excluded = new Set([
    "firstrep_users",
    "session",
    "account",
    "two_factor",
    "passkey",
    "firstrep_login_sessions",
    "firstrep_data_export",
    "firstrep_recovery_request",
  ]);
  const tables =
    await sql`SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='user_id' ORDER BY table_name`;
  for (const { table_name } of tables) {
    if (excluded.has(table_name)) continue;
    data[table_name] =
      await sql`SELECT * FROM ${sql(table_name)} WHERE user_id=${userId}`;
  }
  // Records owned through a parent session/workout are included as well.
  if (await tableExists("firstrep_saved_workout_exercises"))
    data.firstrep_saved_workout_exercises =
      await sql`SELECT e.* FROM firstrep_saved_workout_exercises e JOIN firstrep_saved_workouts w ON w.id=e.workout_id WHERE w.user_id=${userId}`;
  if (await tableExists("firstrep_set_logs"))
    data.firstrep_set_logs =
      await sql`SELECT l.* FROM firstrep_set_logs l JOIN firstrep_workout_sessions s ON s.id=l.session_id WHERE s.user_id=${userId}`;
  data.devices =
    await sql`SELECT id,created_at,updated_at,expires_at,ip_address,user_agent FROM "session" WHERE user_id=${userId}`;
  data.connected_accounts =
    await sql`SELECT provider_id,created_at FROM account WHERE user_id=${userId}`;
  data.passkeys =
    await sql`SELECT name,device_type,backed_up,created_at FROM passkey WHERE user_id=${userId}`;
  const zip = new JSZip();
  zip.file(
    "firstrep.json",
    JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2),
  );
  for (const [name, rows] of Object.entries(data)) {
    if (!rows.length) {
      zip.file(name + ".csv", "");
      continue;
    }
    const keys = Object.keys(rows[0] as object);
    const cell = (v: unknown) =>
      '"' +
      String(
        v == null ? "" : typeof v === "object" ? JSON.stringify(v) : v,
      ).replaceAll('"', '""') +
      '"';
    zip.file(
      name + ".csv",
      [
        keys.map(cell).join(","),
        ...rows.map((row) =>
          keys.map((k) => cell((row as Record<string, unknown>)[k])).join(","),
        ),
      ].join("\r\n"),
    );
  }
  return {
    bytes: await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    }),
    email: users[0].email,
  };
}
async function tableExists(name: string) {
  return !!(await db()`SELECT to_regclass(${name}) AS found`)[0].found;
}
export async function runAccountJobs() {
  const sql = db();
  // Claim durable jobs atomically; interrupted jobs can be retried after 10 minutes.
  const jobs =
    await sql`UPDATE firstrep_data_export SET status='processing',attempts=attempts+1,started_at=NOW() WHERE id IN (SELECT e.id FROM firstrep_data_export e JOIN "user" u ON u.id=e.user_id WHERE u.deleted_at IS NULL AND (e.status='queued' OR (e.status='processing' AND e.started_at<NOW()-INTERVAL '10 minutes')) AND e.attempts<3 ORDER BY e.created_at LIMIT 3 FOR UPDATE OF e SKIP LOCKED) RETURNING id,user_id`;
  for (const job of jobs) {
    try {
      const result = await exportUserData(job.user_id);
      const url = origin() + "/api/account/export/" + job.id;
      await sql`UPDATE firstrep_data_export SET status='ready',file_bytes=${result.bytes},file_url=${url},expires_at=NOW()+INTERVAL '24 hours' WHERE id=${job.id} AND EXISTS(SELECT 1 FROM "user" WHERE id=${job.user_id} AND deleted_at IS NULL)`;
      await accountMail(
        result.email,
        "Your FirstRep data is ready",
        "Download your ZIP within 24 hours. You’ll need to sign in to your account to open it.",
        { url: origin() + "/settings/privacy?export=" + job.id },
      ).catch(() => {});
    } catch {
      await sql`UPDATE firstrep_data_export SET status='failed',file_bytes=NULL WHERE id=${job.id}`;
    }
  }
  await sql`DELETE FROM "user" WHERE deleted_at<NOW()-INTERVAL '30 days'`;
  await sql`DELETE FROM firstrep_data_export WHERE expires_at<NOW()`;
  await sql`DELETE FROM firstrep_reserved_username WHERE release_at<NOW()`;
  await sql`DELETE FROM firstrep_auth_limits WHERE expires_at<NOW()`;
  await sql`DELETE FROM firstrep_auth_failures WHERE updated_at<NOW()-INTERVAL '1 day'`;
  await sql`DELETE FROM verification WHERE expires_at<NOW()`;
  await sql`DELETE FROM "session" WHERE expires_at<NOW()`;
}
