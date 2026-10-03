import Link from "next/link";
import { requirePageSession } from "@/lib/auth-session";
import { redirect } from "next/navigation";
import { RestoreForm } from "@/components/account/restore-form";
import "../../account.css";
export default async function Restore() {
  const session = await requirePageSession("/auth/restore", true);
  if (!session.user.deletedAt) redirect("/");
  return (
    <main className="public-account-page">
      <Link className="account-brand" href="/auth">
        FirstRep<span className="accent">.</span>
      </Link>
      <p className="account-eyebrow">YOUR ACCOUNT / A FRESH START</p>
      <h1>There’s still time.</h1>
      <RestoreForm deletedAt={new Date(session.user.deletedAt).toISOString()} />
    </main>
  );
}
