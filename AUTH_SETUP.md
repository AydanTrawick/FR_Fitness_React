# FirstRep accounts

The account system is self-hosted Better Auth + Drizzle on the app’s existing Neon Postgres database. The blue/charcoal entry screen and account pages use the same app palette. Every app page and account API checks a library-validated session; a cookie’s presence alone never authorizes data access.

## Run and migrate

Use Node 22.20+ and `npm ci`. Copy `.env.example` to `.env.local`, configure `NEON_DATABASE_URL`, `BETTER_AUTH_URL`, and a stable `BETTER_AUTH_SECRET` generated with `npx auth secret`. Never rotate the secret casually: encrypted OAuth/TOTP/backup credentials depend on it. Set the production URL to HTTPS.

For a fresh database, apply the existing tracker/library/analysis migrations 001–006 in order, then run `npm run db:auth`. This idempotent script records each applied migration and adds the Better Auth tables, user settings, audit trail and durable account jobs. Review and back up a production database first. The configured development database has already been migrated. Existing IDs and fitness records remain; legacy login sessions are retired. Existing users verify their email and use password recovery to establish a Better Auth password, or use an email code. Legacy PBKDF2 passwords are not accepted by the new system.

`npm run dev` serves the app on port 3000. Production: `npm run build` then `npm start`.

## Providers and email

- **Resend:** configure `RESEND_API_KEY`, a verified `AUTH_EMAIL_FROM` sender, `SUPPORT_EMAIL`, and `SECURITY_CONTACT_EMAIL`. Account emails render the branded React email template. Existing Gmail settings are a development-only fallback; production requires Resend. No codes or links are written to logs.
- **Google:** configure the client ID/secret and register `<BETTER_AUTH_URL>/api/auth/callback/google` as its redirect URI.
- **Apple:** configure the Services ID, signed Apple client-secret JWT, and optional bundle ID. Register `<BETTER_AUTH_URL>/api/auth/callback/apple`. Renew Apple’s expiring client secret using your Apple developer configuration.
- **Turnstile:** set both `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`, with your app hostname allowed. Without them the widget is omitted; shared throttling still applies.
- **Upstash:** set its REST URL/token for atomic Redis throttling across instances. Without it, equivalent atomic counters persist in Postgres.
- **Sentry:** optional `SENTRY_DSN`. Request headers, bodies, cookies, query parameters, user identity, DB values, AI payloads, breadcrumbs and exception messages are excluded.
- **PostHog:** optional public key/host. Collection starts only after the signed-in user opts in. Autocapture, recording, surveys and profiles are disabled. Only path-level pageviews are emitted; no health data or auth payloads are sent.

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
