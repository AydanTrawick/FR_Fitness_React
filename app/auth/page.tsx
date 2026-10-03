import { headers } from "next/headers";
import { AuthScreen } from "@/components/account/auth-screen";
import { safeReturnTo } from "@/lib/auth/validation";
import "../account.css";
export const metadata = { title: "Continue to FirstRep — FirstRep Fitness" };
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const header = await headers();
  const step =
    typeof query.step === "string" &&
    ["email", "reset", "new-password", "two-factor"].includes(query.step)
      ? query.step
      : "email";
  return (
    <AuthScreen
      providers={{
        google:
          !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
        apple:
          !!process.env.APPLE_CLIENT_ID && !!process.env.APPLE_CLIENT_SECRET,
      }}
      nonce={header.get("x-nonce") || ""}
      siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
      initialStep={step}
      returnTo={safeReturnTo(
        typeof query.returnTo === "string" ? query.returnTo : null,
      )}
      resetToken={typeof query.token === "string" ? query.token : undefined}
    />
  );
}
