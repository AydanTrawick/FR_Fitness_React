import Link from "next/link";
import { requirePageSession } from "@/lib/auth-session";
import { ProgramLibrary, ProgramFooter } from "@/components/program-library";
export default async function Page() {
  await requirePageSession("/programs");
  return (
    <main className="pl-page">
      <nav className="pl-nav">
        <Link className="pl-btn secondary" href="/#programs">
          ← Dashboard
        </Link>
      </nav>
      <ProgramLibrary />
      <ProgramFooter />
    </main>
  );
}
