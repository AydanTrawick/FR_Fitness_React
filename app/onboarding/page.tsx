import { requirePageSession } from "@/lib/auth-session";
import { safeReturnTo } from "@/lib/auth/validation";
import { redirect } from "next/navigation";
import { SettingsProvider } from "@/components/account/settings-context";
import { OnboardingForm } from "@/components/account/onboarding-form";
import "../account.css";
export const metadata = { title: "Make it yours — FirstRep" };
export default async function Onboarding({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const session = await requirePageSession("/onboarding");
  const { returnTo } = await searchParams;
  const target = safeReturnTo(returnTo);
  if (session.user.onboarded) redirect(target);
  return (
    <main className="onboarding-page">
      <SettingsProvider>
        <OnboardingForm returnTo={target} />
      </SettingsProvider>
    </main>
  );
}
