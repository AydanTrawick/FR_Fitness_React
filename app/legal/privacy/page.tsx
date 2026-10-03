export const metadata = { title: "Privacy Policy — FirstRep" };
export default function Privacy() {
  return (
    <>
      <p className="account-eyebrow">VERSION 2026-10-02</p>
      <h1>Privacy Policy</h1>
      <p className="account-notice">
        Draft for review before public launch. The operator’s legal name,
        jurisdiction, contact details, and retention commitments must be
        finalized.
      </p>
      <h2>What FirstRep stores</h2>
      <p>
        We store your account details, chosen preferences, profile photo,
        workout and nutrition records, body measurements, saved workouts, and
        security activity. Private is the default profile setting. Your health
        and training records are restricted to your account.
      </p>
      <h2>How we use your information</h2>
      <p>
        We use these records to provide your fitness tools, save your progress,
        secure your account, deliver requested exports, and respond to support
        requests. Security emails remain enabled. Optional product notifications
        and analytics require your choices in settings.
      </p>
      <h2>Services that process information</h2>
      <p>
        Neon stores application and account records. Better Auth runs within
        FirstRep to manage sign-in. Google and Apple process their respective
        social sign-ins when you choose them. Resend delivers account and
        support emails when enabled. Cloudflare Turnstile processes security
        checks when enabled, and Upstash stores shared rate-limit counters when
        configured.
      </p>
      <p>
        Anthropic receives requests you submit to AI features. Saved workout and
        meal history is included only with your consent and an explicit request
        to include it. ElevenLabs receives recordings or response text when you
        use voice features. Optional PostHog analytics is enabled only after
        opting in and excludes health records and sign-in credentials.
      </p>
      <h2>Cookies and analytics</h2>
      <p>
        Essential cookies keep you signed in and protect authentication.
        Optional analytics is off by default. Turn it on or off in Privacy &
        data. We do not send passwords, verification codes, tokens, workout
        history, or body measurements to product analytics.
      </p>
      <h2>Your controls</h2>
      <p>
        You can edit your profile, revoke sessions, change permissions, request
        an export, and schedule account deletion from settings. Export links
        require sign-in and expire after 24 hours. Deletion hides your account
        immediately and permanently deletes its database records after a 30-day
        restoration period. Generated export files and profile images are
        removed with your account.
      </p>
      <h2>Security and contact</h2>
      <p>
        We use library-managed password hashing, encrypted two-factor secrets,
        hashed verification codes, access checks, and protected session cookies.
        No system can guarantee perfect security. Use the Help tab for questions
        or the security contact at /.well-known/security.txt to report a
        vulnerability.
      </p>
    </>
  );
}
