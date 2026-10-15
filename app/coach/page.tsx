import { requirePageSession } from "@/lib/auth-session";
import ProgressWorkspace from "@/components/progress/workspace";
export const metadata = { title: "Progress Coach — FirstRep" };
export default async function CoachPage() {
  await requirePageSession("/coach");
  return <ProgressWorkspace mode="coach" />;
}
