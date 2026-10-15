# FirstRep accounts

The account system is self-hosted Better Auth + Drizzle on the app’s existing Neon Postgres database. The blue/charcoal entry screen and account pages use the same app palette. Every app page and account API checks a library-validated session; a cookie’s presence alone never authorizes data access.

## Run and migrate

Use Node 22.20+ and `npm ci`. Copy `.env.example` to `.env.local`, configure `NEON_DATABASE_URL`, `BETTER_AUTH_URL`, and a stable `BETTER_AUTH_SECRET` generated with `npx auth secret`. Never rotate the secret casually: encrypted OAuth/TOTP/backup credentials depend on it. Set the production URL to HTTPS.

For a fresh database, apply the existing tracker/library/analysis migrations 001–006 in order, then run `npm run db:auth`. This idempotent script records each applied migration and adds the Better Auth tables, user settings, audit trail and durable account jobs. Review and back up a production database first. The configured development database has already been migrated. Existing IDs and fitness records remain; legacy login sessions are retired. Existing users verify their email and use password recovery to establish a Better Auth password, or use an email code. Legacy PBKDF2 passwords are not accepted by the new system.

`npm run dev` serves the app on port 3000. Production: `npm run build` then `npm start`.

## Providers and email

- **Email:** Resend is preferred: configure `RESEND_API_KEY` and `AUTH_EMAIL_FROM` on a domain verified in Resend. Production account emails require Resend. Local development can use the existing `EMAIL_ADDRESS` and `EMAIL_PASSWORD` Gmail settings when no Resend key is set. Use a Gmail app password with 2-Step Verification enabled, not your normal Google password. Configure `SUPPORT_EMAIL` and `SECURITY_CONTACT_EMAIL` separately. No codes or links are written to logs.
- **Google:** in Google Cloud, configure the OAuth consent screen and create an OAuth client of type **Web application**. Set the authorized JavaScript origin to `https://fr-fitness.vercel.app` and redirect URI to `https://fr-fitness.vercel.app/api/auth/callback/google`. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Vercel's Production environment. In testing mode, add your test users; publish the consent screen for public sign-in. See [Google provider setup](https://better-auth.com/docs/authentication/google).
- **Apple:** in Apple Developer, enable Sign in with Apple on the primary App ID, then create/link a **Services ID** for the website. Register domain `fr-fitness.vercel.app` and return URL `https://fr-fitness.vercel.app/api/auth/callback/apple`. Use the Services ID as `APPLE_CLIENT_ID`. Create a Sign in with Apple key and use its `.p8` private key, Key ID, and Team ID to sign the client-secret JWT; store that JWT as `APPLE_CLIENT_SECRET`, not an Apple password or the raw `.p8` file. The secret expires (at most six months), so schedule renewal. `APPLE_BUNDLE_ID` is optional for native integration. Apple POST callbacks are allowed from `https://appleid.apple.com` only at the Apple callback endpoint when the provider is configured. See [Apple provider setup](https://better-auth.com/docs/authentication/apple).
- **Turnstile:** set both `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`, with your app hostname allowed. Without them the widget is omitted; shared throttling still applies.
- **Upstash:** set its REST URL/token for atomic Redis throttling across instances. Without it, equivalent atomic counters persist in Postgres.
- **Sentry:** optional `SENTRY_DSN`. Request headers, bodies, cookies, query parameters, user identity, DB values, AI payloads, breadcrumbs and exception messages are excluded.
- **PostHog:** optional public key/host. Collection starts only after the signed-in user opts in. Autocapture, recording, surveys and profiles are disabled. Only path-level pageviews are emitted; no health data or auth payloads are sent.

For Resend production setup, add a domain you own in the [Resend domain dashboard](https://resend.com/domains), copy its exact DNS records into your DNS provider, and wait for verification. Configure `RESEND_API_KEY` (a sending key for that domain) and `AUTH_EMAIL_FROM` (for example `FirstRep <accounts@yourdomain.com>`) in Vercel's Production environment. The sender domain must match the verified domain or subdomain. The shared `vercel.app` hostname cannot be your Resend sending domain. See [Resend verification](https://resend.com/docs/dashboard/domains/introduction). Enter secrets directly into Vercel rather than chat. Redeploy after configuring email or social providers, then test sign-up verification and each enabled provider on the stable production hostname. A successful build alone does not verify delivery or OAuth.

Absent Google/Apple credentials show disabled “Coming soon” buttons. Services are not provisioned or enabled automatically. The app saves email/push notification choices; a reminder scheduler and push delivery service are not part of the current app. Security email delivery is mandatory whenever its provider is configured.

## Sessions, privacy and background jobs

Remembered sessions last 30 days with daily sliding renewal. Unchecked Remember me caps a session at one day. Security changes, exports and deletion require a sign-in within ten minutes. Password/email-code/OAuth sign-ins for 2FA accounts remain challenged; passkeys are independently strong sign-in credentials. Backup codes are single-use and encrypted by Better Auth.

Profiles start private. Saved workout/meal history is excluded from AI requests unless the user opts in under Privacy and checks “Include my recent workouts and meals” on that request. Current conversation messages still accompany follow-up prompts, as shown in the chat. Body measurements are never included automatically.

Configure `CRON_SECRET` using a generated random secret. `vercel.json` runs `/api/jobs/accounts` once daily at 09:00 UTC, compatible with Vercel Hobby; Vercel sends the bearer secret. Hobby execution may occur within the scheduled hour. On another host, schedule a daily HTTPS request with `Authorization: Bearer <CRON_SECRET>`. This worker retries interrupted exports, expires files after 24 hours, releases reserved usernames, clears expired authentication records, and permanently deletes accounts after their 30-day restoration window. Exports are scoped to the current user and exclude password hashes, session credentials, TOTP secrets, backup codes and OAuth tokens. Files live inside Postgres and cascade with account deletion. Download authorization still expires exactly after 24 hours. Physical file cleanup and permanent deletion occur on the next daily run after their deadlines. Without the scheduled worker, queued retry/expiry and final deletion will not run automatically.

Device information comes from session user-agent and IP data. Approximate location is displayed as unavailable because no trusted geolocation provider is connected. Only trust forwarding IP headers from your deployed reverse proxy. The Terms/Privacy pages are labelled drafts; replace operator/contact details and obtain legal review before launch. Third-party notices are linked from Help.

## Verification

`npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` check the app.

Start `npm run dev:auth-tests`, then `npm run test:auth` in another terminal. This uses Chrome, disposable `firstrep-test-…@example.invalid` accounts, a virtual passkey authenticator, and a development-only email capture. Tests cover verification, profile persistence, 2FA, one-use backup/reset credentials, email-change undo after sign-out, lost-authenticator recovery, protected data, exports, session freshness, all settings routes at phone width, deletion/restoration and rate limits. They remove only those disposable users afterward. The mailbox endpoint is unavailable in production and requires the test header key; never enable test mode on a shared development deployment. Screenshot artifacts omit secret backup codes.

## Vercel production environment

Local `.env`/`.env.local` files are ignored by Git and are not uploaded to Vercel. In the project’s Settings → Environment Variables, add `NEON_DATABASE_URL` (your Neon Postgres connection string), `BETTER_AUTH_SECRET` (the existing stable local secret if using the same database), and `BETTER_AUTH_URL` (the actual HTTPS production app origin). Select the **Production** environment. Enable Preview separately if preview deployments should connect to a database; use an isolated preview database where possible. Configure Resend and the other enabled providers there as well. Add `CRON_SECRET` for scheduled maintenance.

Redeploy after adding or changing environment variables. A missing `NEON_DATABASE_URL` formerly crashed page-data collection because authentication constructed its database adapter at module import. Authentication now initializes on the first request, so route discovery/builds do not need database credentials. Missing account configuration returns an unavailable response at runtime; successful deployment alone does not mean sign-in is configured. Do not replace the connection string with a placeholder or regenerate the secret when the database already contains encrypted authenticator credentials.


## Sign-up origin errors and passkeys

Set `BETTER_AUTH_URL` to the stable public origin used in the browser (for example `https://your-app.example`). Use an origin only, without `/api/auth` or another path. Trailing slashes are normalized. If multiple exact origins serve the app, list the additional origins in `AUTH_TRUSTED_ORIGINS`, comma separated; these are used for both Better Auth origin checks and passkey verification. Never use wildcard deployment domains or disable origin checks.

On Vercel, missing URLs or copied localhost values resolve from system environment variables: production uses `VERCEL_PROJECT_PRODUCTION_URL`, previews use `VERCEL_URL`. Only this deployment’s exact generated URL and branch alias are added automatically to the allowlist. Enable access to Vercel System Environment Variables if using this fallback. Explicit `BETTER_AUTH_URL` takes precedence, so an outdated public URL must still be corrected and redeployed. Email/recovery/security links use the same resolved origin.

Passkeys are scoped to the hostname in `BETTER_AUTH_URL`. Register and use them on that stable hostname; visiting an unrelated deployment hostname cannot reuse a production passkey even if sign-up on that origin is allowed. A passkey created on localhost or a previous domain cannot move to the production hostname. Sign in using email/password or an email code, then add a new passkey in Settings → Security on the production website. Do not change the stable hostname between releases. For subdomains, the base hostname must be their valid WebAuthn relying-party domain.

For the `fr-fitness` production project, set `BETTER_AUTH_URL` to `https://fr-fitness.vercel.app` in Vercel's Production environment, then redeploy. An HTTP 403 `INVALID_ORIGIN` from sign-in indicates an address configuration problem, not an incorrect password. Verified Vercel production, deployment, and branch origins are included in the code's exact allowlist; arbitrary request hosts are never trusted. The login UI now reports origin, service, and throttling failures separately, and explicitly confirms a fresh session after successful authentication.
