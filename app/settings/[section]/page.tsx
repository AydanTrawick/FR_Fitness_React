import { loadFaq } from "@/lib/auth/faq";
import { notFound } from "next/navigation";
import { SettingsSection } from "@/components/account/settings-section";
const sections = [
  "profile",
  "username",
  "email",
  "password",
  "security",
  "connected-accounts",
  "sessions",
  "activity",
  "notifications",
  "privacy",
  "help",
];
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section)) notFound();
  return (
    <SettingsSection
      section={section}
      faqs={section === "help" ? loadFaq() : []}
    />
  );
}
