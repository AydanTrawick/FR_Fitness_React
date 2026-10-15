import { requirePageSession } from "@/lib/auth-session";
import ProgressWorkspace from "@/components/progress/workspace";
export const metadata = { title: "Your Progress — FirstRep" };
export default async function ProgressPage() {
  await requirePageSession("/progress");
  return <ProgressWorkspace mode="progress" />;
}
