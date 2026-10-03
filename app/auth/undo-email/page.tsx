import Link from "next/link";
import { headers } from "next/headers";
import { EmailUndoForm } from "@/components/account/email-undo-form";
import "../../account.css";
export default async function UndoEmail({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; change?: string }>;
}) {
  await headers();
  const params = await searchParams;
  return (
    <main className="public-account-page">
      <Link className="account-brand" href="/auth">
        FirstRep<span className="accent">.</span>
      </Link>
      <h1>Secure your account.</h1>
      <EmailUndoForm token={params.token || ""} change={params.change || ""} />
    </main>
  );
}
