import { runAccountJobs } from "@/lib/auth/account-service";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET || process.env.ACCOUNT_JOBS_SECRET;
  if (!secret || request.headers.get("authorization") !== "Bearer " + secret)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  await runAccountJobs();
  return Response.json({ ok: true });
}
