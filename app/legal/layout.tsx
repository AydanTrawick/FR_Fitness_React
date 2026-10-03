import Link from "next/link";
import { headers } from "next/headers";
import "../account.css";
export default async function Legal({
  children,
}: {
  children: React.ReactNode;
}) {
  await headers();
  return (
    <main className="public-account-page legal-copy">
      <Link className="account-brand" href="/auth">
        FirstRep<span className="accent">.</span>
      </Link>
      {children}
      <p>
        <Link className="text-link" href="/auth">
          ← Back to sign-in
        </Link>
      </p>
    </main>
  );
}
