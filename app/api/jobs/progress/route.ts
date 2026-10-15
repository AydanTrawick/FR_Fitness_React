import { cleanupPhotos } from "@/lib/progress/photos";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== "Bearer " + process.env.CRON_SECRET
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ deleted: await cleanupPhotos() });
}
