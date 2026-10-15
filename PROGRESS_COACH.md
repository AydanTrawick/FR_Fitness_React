# Progress Coach — Phase 1

Progress → Start Baseline → Coach → confirm Goal Card → saved Playbook. The new routes are `/progress`, `/progress/check-in`, `/coach`, and `/playbook`, also linked in the dashboard navigation. Data belongs to the current Better Auth `user.id`, with foreign-key account deletion cascades. Weight is kg and height cm in Postgres; the UI defaults to lb and ft/in.

## Setup

1. Install dependencies with `npm install`.
2. Apply the existing auth and exercise-library migrations first, then run `npm run db:progress`. The progress migration is additive and tracked in `firstrep_schema_migrations`.
3. Set `ANTHROPIC_API_KEY` and optionally `COACH_MODEL` (default `claude-sonnet-5-5`, falling back to the existing `ANTHROPIC_MODEL` when set). The structured wrapper and the original text builder share `lib/ai-plan-builder.ts`; coach plans validate against Zod, real exercise IDs, and server health rules before saving.
4. For photos, create a **separate private R2 bucket**. Disable its managed `r2.dev` URL and every custom domain. Set `PROGRESS_R2_BUCKET_NAME`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. Grant the S3 credentials read/write access to that bucket. Set `PROGRESS_R2_API_TOKEN` to a Cloudflare management API token with account R2 read access so uploads can verify both public-access settings. Uploads fail closed if privacy cannot be verified. Do not expose this bucket through a Worker or other public proxy.
5. Configure `CRON_SECRET` for `/api/jobs/progress`, scheduled daily in `vercel.json`. This Phase 1 job retries file deletion only; weekly reminders/recaps are Phase 2. For deployments without Vercel, schedule this authenticated GET yourself. Account deletion queues every removed photo using a database trigger, so object deletion survives account cascades and transient storage failures.

Missing photo credentials disable photo upload while weight tracking works. Missing Anthropic credentials disable chat while check-ins work. Nothing falls back to public storage or browser-local plan persistence. Use a Vercel function tier with the configured 300-second maximum duration for plan generation; the agent has a four-turn limit and aborts after 260 seconds. No service credentials are sent to clients.

## Privacy and safety

Photos require a birth year indicating 18+, explicit adult attestation, and consent. Uploads accept one JPEG/PNG/WebP under 4 MB per pose per check-in. Sharp decodes, rotates, strips metadata and resizes to at most 1600 px. A separate vision moderation gate rejects explicit/nude, unwearable, ambiguous-age, or unusable images before storage. Vision moderation is probabilistic; review the classifier against your own clothed-photo fixtures before launch. No body analysis is performed in Phase 1.

Only photo IDs and poses reach the client. The same-origin photo endpoint requires both the owning account's active session and an HMAC-signed link with a lifetime of at most 10 minutes. Responses use private/no-store cache headers. Delete all my photos removes DB metadata and any analyses, revokes view access immediately, deletes storage objects, and retains durable retry jobs on failure. Upload cleanup jobs are written before storage so interrupted requests do not orphan photos.

Confirmed goals enforce loss at most 1% of baseline weight/week and gain at most 1 lb/week; very low weight targets require professional review. Plan calorie targets must be at least estimated BMR and the configured sex-specific floor. Macro estimates must match calories within 10%. Under-18 plans have no numeric calorie/macro or weight-change targets. Recognized disordered-eating requests pause numeric planning and provide support; this persistent precaution requires qualified review before planning is re-enabled. Automated text detection is a backstop; model instructions also cover this policy.

Every subsequent edit creates a pending full-Playbook proposal, requires a preview before approval in the UI, and inserts a new immutable version on acceptance. Stale proposals cannot overwrite a newer version. Saved workouts and favorites reuse existing library APIs. Coach requests use shared Redis/Postgres throttling and a per-user database lease to serialize concurrent coach turns, confirmations and photo mutations.

## Verification

`npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` check the implementation. Run `npm run dev:progress-tests`, then `npm run test:progress` for the authenticated mobile/desktop flow, real SSE/tool-loop handling against an isolated local provider fixture, persistence, ownership checks, habit check-offs and versioned approvals. Browser tests use disposable test users and clean them up; they do not call paid AI services. Real Anthropic streaming and real private R2 moderation/upload/deletion require configured credentials and a separate deployment smoke test.

Phase 2 photo analysis, Insights, weekly reminders/recaps, automated proposals and streaks, and Phase 3 capture overlays, comparisons, milestones and voice integration are intentionally deferred. Manual approved edits and basic daily habit checks are included so saved Phase 1 items remain usable and editable.

Provider compatibility: Sonnet 5.5 requires automatic tool selection; forced `tool`/`any` choices return HTTP 400. The structured wrapper explicitly requests its result tool and validates the returned arguments locally. See the [official Sonnet 5.5 migration guide](https://platform.claude.com/docs/en/models/sonnet-5-5/migration-guide).
