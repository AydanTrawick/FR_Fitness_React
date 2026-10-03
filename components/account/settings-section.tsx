"use client";
import { ProfileSettings } from "./profile-settings";
import { UsernameSettings } from "./username-settings";
import {
  EmailSettings,
  PasswordSettings,
  ConnectedAccountsSettings,
} from "./login-method-settings";
import { SecuritySettings } from "./security-settings";
import { SessionSettings, ActivitySettings } from "./session-settings";
import { PreferencesSettings } from "./privacy-settings";
import { HelpSettings } from "./help-settings";
import { useAccount } from "./settings-context";
import { authClient, reloadAccountPage } from "@/lib/auth-client";
import type { FAQ } from "@/lib/auth/faq";
const titles: Record<string, [string, string]> = {
  profile: ["Profile", "Make your account feel like you."],
  username: ["Username", "Your handle, wherever your training takes you."],
  email: ["Email address", "Keep your sign-in and recovery email up to date."],
  password: ["Password", "A strong foundation for your account."],
  security: [
    "Security",
    "Protect your progress with passkeys and two-factor authentication.",
  ],
  "connected-accounts": [
    "Connected accounts",
    "More ways to get back to your training.",
  ],
  sessions: [
    "Sessions & devices",
    "Stay in control of where your account is open.",
  ],
  activity: ["Account activity", "Your recent sign-ins and security changes."],
  notifications: ["Notifications", "Hear from FirstRep on your terms."],
  privacy: [
    "Privacy & data",
    "Your progress is personal. You decide how it’s used.",
  ],
  help: ["Help & support", "A little guidance when you need it."],
};
export function SettingsSection({
  section,
  faqs = [],
}: {
  section: string;
  faqs?: FAQ[];
}) {
  const { data, working, perform } = useAccount();
  const [title, subtitle] = titles[section];
  return (
    <>
      <header>
        <p className="account-eyebrow">YOUR ACCOUNT / FIRSTREP</p>
        <div className="row between wrap">
          <h1>{title}</h1>
          <button
            className="text-link"
            disabled={working}
            onClick={() =>
              void perform(async () => {
                await authClient.signOut();
                reloadAccountPage("/auth");
              }, "")
            }
          >
            Sign out
          </button>
        </div>
        <p className="account-muted">{subtitle}</p>
      </header>
      {!data ? (
        <p className="account-notice" role="status">
          Getting your account ready…
        </p>
      ) : section === "profile" ? (
        <ProfileSettings />
      ) : section === "username" ? (
        <UsernameSettings />
      ) : section === "email" ? (
        <EmailSettings />
      ) : section === "password" ? (
        <PasswordSettings />
      ) : section === "security" ? (
        <SecuritySettings />
      ) : section === "connected-accounts" ? (
        <ConnectedAccountsSettings />
      ) : section === "sessions" ? (
        <SessionSettings />
      ) : section === "activity" ? (
        <ActivitySettings />
      ) : section === "privacy" || section === "notifications" ? (
        <PreferencesSettings section={section} />
      ) : (
        <HelpSettings faqs={faqs} />
      )}
    </>
  );
}
