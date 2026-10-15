import { requirePageSession } from "@/lib/auth-session";
import ProgressWorkspace from "@/components/progress/workspace";
export const metadata = { title: "Your Playbook — FirstRep" };
export default async function PlaybookPage() {
  await requirePageSession("/playbook");
  return <ProgressWorkspace mode="playbook" />;
}
