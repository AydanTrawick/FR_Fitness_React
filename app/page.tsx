import FirstRep from "@/components/firstrep";
import { requirePageSession } from "@/lib/auth-session";
export default async function Home() {
  await requirePageSession("/");
  return <FirstRep />;
}
