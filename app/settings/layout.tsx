import { BrandLogo } from "@/components/brand-logo";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePageSession } from "@/lib/auth-session";
import { SettingsProvider } from "@/components/account/settings-context";
import { SettingsNav } from "@/components/account/settings-nav";
import "../account.css";
export const metadata = { title: "Account settings — FirstRep" };
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageSession("/settings/profile");
  return (
    <main className="settings-shell">
      <header className="settings-topbar">
        <Link href="/" className="account-brand">
          <span>
            <BrandLogo size={36} />
          </span>
          FirstRep<span className="accent">.</span>
        </Link>
        <Link className="text-link" href="/">
          <ArrowLeft size={15} /> Back to your toolkit
        </Link>
      </header>
      <div className="settings-layout">
        <SettingsNav />
        <div className="settings-content">
          <SettingsProvider>{children}</SettingsProvider>
        </div>
      </div>
    </main>
  );
}
