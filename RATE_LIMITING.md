# Auth, plans and assistant rate limits

FirstRep uses self-hosted Better Auth with Neon and runs on Vercel. These guards run inside route handlers, before password/account work or paid provider calls. They do not run in middleware. Authenticated limits use the verified Better Auth session ID, never a body-supplied user ID.

## Protected routes

| Routes | Limits and scope |
| --- | --- |
| `POST /api/auth/sign-in/email`, `/sign-in/email-otp`, `/sign-in/username` | IP 20 per 15 minutes and normalized, hashed email/username 5 per 15 minutes. `login` scope. Successful credential acceptance resets only the identity allowance. |
| Other `POST /api/auth/sign-in/*`, including Google | IP 20 per 15 minutes. No shared blank-email bucket, so unrelated OAuth users do not throttle each other. |
| `POST /api/auth/sign-up/email` | IP 3 per hour. `signup` scope. |
| `POST /api/auth/request-password-reset`, `/email-otp/request-password-reset` | Hashed email 3 per hour and IP 10 per hour. `reset` scope. |
| `POST /api/auth/email-otp/send-verification-otp` with `type: forget-password` | Same password reset limits. |
| `POST /api/auth/send-verification-email`, `/email-otp/send-verification-otp` with other types | Hashed email 1 per minute and 5 per day. `verify` scope. |
| `POST /api/ai` in plan mode, `POST /api/coach`, `POST /api/progress/goals/confirm` | Shared user allowance 10 per hour and 30 per day, plus IP 30 per hour. `plan_builder` scope. Coach planning turns count once each, including their bounded tool calls and any generated adjustment. |
| `POST /api/assistant/transcribe`, `/chat`, `/speak`; native audio `GET /api/assistant/speak`; legacy `POST /api/transcribe`, `/api/speech` | Shared user allowance 20 requests per minute and 200 per day. Each paid STT, model or TTS step counts one request, including typed assistant chat. `voice` scope. |
| Both current and legacy speech endpoints | Shared 20,000 TTS characters per user per day, charged using `limit(userKey, { rate: text.length })` before ElevenLabs. Current speech counts the final formatted text sent to ElevenLabs. |

`/api/ai` assistant mode remains retired. A plan request without a session gets 401 before Redis. Plan routes share a per-user Redis NX lock with a 60-second expiry, renewed every 20 seconds during long generations and released in `finally` using an owner comparison. Duplicates return 409 without spending generation allowance. Existing Progress Coach database leases still serialize its database mutations.

TTS character exhaustion returns HTTP 200 with the text and `ttsLimited: true`; chat also previews this allowance so automatic playback can be skipped. Native audio preparation checks allowance without spending it. Every actual native audio GET spends request and character tokens, including ticket replays. The browser handles streaming/native JSON fallbacks and shows “Audio is paused for today. Your text replies are still available.” Text chat remains subject to its own request limits.

## Configuration and behavior

All new policy numbers are in `lib/ratelimit/config.ts`. Each row has its own Upstash prefix. The singleton in `limiters.ts` uses `Ratelimit.slidingWindow`, analytics, a one-second timeout, and Next.js `after` for pending analytics. Sliding windows use Upstash's weighted current/previous buckets; reset times are estimates, not exact rolling-window reset guarantees. See [Upstash algorithms](https://upstash.com/docs/redis/sdks/ratelimit-ts/algorithms) and [methods](https://upstash.com/docs/redis/sdks/ratelimit-ts/methods).

IP lookup prefers `x-real-ip`, which Vercel replaces at its edge, then the first `x-forwarded-for` entry. See [Vercel request headers](https://vercel.com/docs/headers/request-headers). A self-hosted proxy must sanitize these headers. Missing headers share an `unknown` IP bucket. Emails are trimmed, lowercased, then SHA-256 hashed; raw emails never enter the new Redis keys or analytics.

The overlapping Better Auth per-route fixed limits and email-based database lockout were removed for covered routes. Existing two-factor, bot and password checks remain. Authentication failures return “Invalid email or password”. Reset/verification responses use “If an account exists for that email, we sent a link.” for both present and absent accounts. Origin/bot rejections and rate limits remain explicit. Failed-login security notifications are retained without account lockouts.

All covered 429 responses have `error`, `message`, `retryAfterSeconds`, and `scope`, plus a matching `Retry-After` header. They never disclose which auth limiter fired. Clients display the wait from `retryAfterSeconds`; existing in-flight disables remain, with synchronous duplicate-submit guards for auth and plan/chat requests.

Set these **server-only** variables privately in `.env.local` (or `.env`) and in Vercel Production, then restart/redeploy:

```dotenv
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-private-rest-token
```

Missing/invalid configuration, timeouts, or Redis failures allow requests and emit `[rate-limit]` server warnings. No Postgres or memory fallback silently substitutes a different limit on these routes. This deliberately means protection and generation deduplication are unavailable during a Redis outage. Other pre-existing account/recovery/check-in/photo limits retain their storage and policy. Their Redis adapter now also fails open within one second, so a Redis outage cannot break session confirmation or two-factor login after the new login guard allowed it. Redis holds only rate counters, rate analytics and the requested short generation locks. No schema migration is required.

## Validation

```sh
npm test
npm run test:ratelimit-routes
# Optional live Redis acceptance test, using isolated keys and automatic cleanup:
npm run test:ratelimit-redis
npm run lint
npm run build
```

`tests/ratelimit.test.mjs` covers normalization, parallel login checks, known/unknown identities, successful-login reset, signup/reset/verification thresholds, hourly/daily/IP plan caps, duplicate/owner-safe locks, aggregate voice budgets, weighted TTS charging, fail-open behavior including stalled connections, and client messages. It uses deterministic fake Redis/limiter adapters and advances their clock.

`test:ratelimit-routes` executes the actual auth, AI, Progress Coach and assistant route source in isolated VM modules, stubbing infrastructure boundaries. It verifies 401 before Redis, 429 before provider or auth/database calls, 409 for duplicates, normal plan/audio responses, cross-route voice budgets, native playback and text-only TTS fallbacks. It sends no mail and touches no live database/provider.

The assistant browser suite covers normal chat/voice and the new retry/audio-paused notices on Chrome and WebKit. Production activation additionally requires a successful connection to the configured Upstash database; offline tests do not establish that credentials are deployed.

`test:ratelimit-redis` additionally uses the real Upstash SDK and configured Redis to verify login allowance/reset, signup, plan limits and locks, voice request caps and weighted TTS characters. It asserts that no check passed by failing open and removes its uniquely prefixed rate/analytics keys afterward. No other application service is invoked.

For the real signup/password/session round trip, start `node scripts/auth-test-server.mjs` and run `node --env-file=.env --env-file=.env.local node_modules/@playwright/test/cli.js test tests/ratelimit-auth.browser.spec.mjs --workers=1`. This test creates one temporary account in the configured Neon database, verifies the fixture directly, signs in through the browser, and deletes that account in `finally`. It uses fresh short-lived connections and retries fixture SQL after transient connection resets. Test email is captured by the local auth test server. The retry-message browser tests are in `tests/ratelimit.browser.spec.mjs`.

Validated locally: 124 unit tests, actual-handler acceptance tests, live Redis acceptance (without fail-open), password signup/session round trip, login/recovery retry messages, normal typed and voice logging, and quota notices in Chrome and WebKit. No application schema migration or production deployment was performed for this change.

## Personal usage card

The Usage limits button is available in the toolkit header, AI tool headings and Progress workspace. `GET /api/usage` requires the authenticated session and returns a private, non-cacheable snapshot of the five personal AI/assistant limits plus the plan network backup allowance. It ignores client-supplied user IDs. One read-only Redis Lua operation reads the exact current/previous enforcement buckets; viewing usage creates no counters, analytics events or token charges.

The card shows remaining allowance, used allowance, accessible progress bars, and recovery countdowns with local dates/time zones. Assistant requests mean individual STT, model and TTS steps. Audio is measured in the actual enforced twenty-thousand-character allowance, not estimated audio minutes or LLM tokens.

Recovery uses the same weighted-bucket formula as the installed Upstash single-region sliding-window algorithm. The SDK reset field alone is only the next bucket boundary and must not be displayed as a full refill. The card computes the first further allowance and full recovery assuming no new usage. No counters are reset by this feature. These calculations depend on the installed SDK's bucket layout and formula; rerun the live comparison when upgrading it.

Balances refresh on open, every fifteen seconds while visible, on focus/visibility, after paid requests, and when a displayed recovery time expires. Device-clock differences do not drive the countdown: it uses the server sample time plus monotonic browser elapsed time. Redis outages display unknown balances rather than fabricated credits; failed refreshes or expired sessions discard old balances. Closing the modal aborts its read and stops polling.

Validation: `tests/usage.test.mjs` covers weighted usage, boundary recovery, character overshoot, read-only scoping, unknown balances and refresh notifications. The actual-handler acceptance script covers session rejection and private cache headers. `npm run test:usage-redis` compares all six readings against real SDK clients using uniquely named temporary counters and verifies reads leave them unchanged, then deletes those fixture keys. `tests/usage.browser.spec.mjs` uses the assistant test server to check bars, polling/refresh, outages, session expiry, focus, dismissal and responsive layout.
