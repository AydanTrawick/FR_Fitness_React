import { requirePageSession } from "@/lib/auth-session";
import ProgressWorkspace from "@/components/progress/workspace";
export const metadata = { title: "Check-in — FirstRep" };
export default async function CheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ checkin?: string }>;
}) {
  await requirePageSession("/progress/check-in");
  const params = await searchParams;
  return <ProgressWorkspace mode="check-in" checkinId={params.checkin} />;
}
