import Link from "next/link";
import { headers } from "next/headers";
import { loadFaq } from "@/lib/auth/faq";
import { FaqSearch } from "@/components/account/help-settings";
import { RecoveryForm } from "@/components/account/recovery-form";
import "../../account.css";
export const metadata = { title: "Sign-in help — FirstRep" };
export default async function Help() {
  await headers();
  return (
    <main className="public-account-page">
      <Link className="account-brand" href="/auth">
        FirstRep<span className="accent">.</span>
      </Link>
      <p className="account-eyebrow">A LITTLE GUIDANCE</p>
      <h1>Let’s get you back in.</h1>
      <p className="account-muted">
        Start with your sign-in method. Your training will be here when you
        return.
      </p>
      <section className="settings-card" style={{ marginTop: 28 }}>
        <div className="stack">
          <Link className="text-link" href="/auth?step=reset">
            Reset a forgotten password →
          </Link>
          <Link className="text-link" href="/auth">
            Sign in with Google, Apple, or a passkey →
          </Link>
          <a className="text-link" href="#two-factor-recovery">
            Recover a lost authenticator →
          </a>
        </div>
        <FaqSearch faqs={loadFaq()} />
      </section>
      <RecoveryForm />
      <p className="account-hint">
        Report security issues through{" "}
        <a className="text-link" href="/.well-known/security.txt">
          our security contact
        </a>
        .
      </p>
    </main>
  );
}
