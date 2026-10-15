# Training Assistant: text and voice

Phase 2 extends the existing Training assistant with typed workout and food tools. Schema migration `database/011_voice_assistant.sql` was approved and applied separately. Phases 2–5 are implemented locally; they have not been deployed. The sections below distinguish the original typed-tool work from the completed voice additions.

## Behavior

- Workout and food requests create server-held drafts, not tracker entries. Each draft shows its date, values, Edit, Confirm and Cancel controls.
- Confirm saves in a transaction using authenticated ownership and row locks. A retry returns the original inserted IDs. Workout sets use one existing workout row per set, normalized kilograms plus the original unit/weight, and optional RPE.
- Food nutrients and calories omitted by the user remain NULL. The tracker, dashboard and CSV export preserve unknown values and label partial totals. Only legacy/manual macro entries derive calories; assistant entries use explicitly provided calories.
- The user's profile timezone determines today; the profile weight unit supplies the fallback. Explicit lb/kg overrides it. Bodyweight is supported; added weight uses lb/kg.
- Ambiguous exercises offer up to three choices and a custom-name option. “Same again” or “another set” creates a new draft from the last confirmed entry in this transient chat, including confirmed edits.
- A new request cancels earlier unconfirmed drafts in this chat. Drafts created together remain separate cards. Confirmation refuses drafts after 30 minutes; subsequent chat requests also mark expired drafts. There is no expiry cron job.
- History reads require both Privacy `aiDataOptIn` and the request's include-history switch. History being off does not block new logging.
- Conversations stay in screen memory. Draft payloads and confirmed actions remain in the database; there is no audio or transcript storage. All provider requests use server-side keys.

## Routes and configuration

Existing server variables: `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL` (existing default `claude-sonnet-4-6`), `NEON_DATABASE_URL`, and the existing Better Auth configuration. No new Phase 2 environment variable is required.

| Route                                      | Request                                                                                                            | Result                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `POST /api/assistant/chat`                 | `prompt`, `conversationId` UUID, `requestId` UUID, optional text history and `includeTrainingHistory`; mode `text` | `replyText`, `pendingActions`, optional `exerciseChoices` |
| `POST /api/assistant/actions/{id}/confirm` | `conversationId`, optional edited `payload`                                                                        | Status and stable inserted `resultIds`                    |
| `POST /api/assistant/actions/{id}/cancel`  | `conversationId`                                                                                                   | Draft status                                              |

Every route requires a signed-in session and checks origin. Owner IDs come from the session, never the model/request body. Keep the same request ID when retrying a chat turn. Action confirmation uses the draft ID as its stable operation identity. The old `/api/ai` continues serving the plan builder; the assistant UI uses the new chat route.

Tools: `log_workout_set`, `log_food`, `search_exercises`, `get_today_summary`. Only the confirmation endpoint writes the real logs. Claude receives matching tool results and returns the final reply; it has no confirmation/edit/delete tool. Definitions and the manual loop follow the [Claude tool definition documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools) and [tool-call protocol](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls). The existing model is supported by the installed SDK and the [models documentation](https://platform.claude.com/docs/en/models/overview).

## Exact Phase 2 file list

Existing files changed:

- `app/api/[...path]/route.ts`: preserve metadata and NULLs through log reads/writes, use the new assistant path, keep plan behavior.
- `lib/tracking.ts`: nullable validation, metadata preservation, known calorie handling and CSV compatibility.
- `components/tools.tsx`: connect the existing assistant UI to drafts and confirmations.
- `components/trackers.tsx`: preserve unknown values in edits and label partial nutrition totals.
- `components/dashboard.tsx`: display unknown calories without deriving unstated values.

New files:

- `lib/assistant/schema.ts`
- `lib/assistant/tools.ts`
- `lib/assistant/prompt.ts`
- `lib/assistant/exercise.ts`
- `lib/assistant/actions.ts`
- `lib/assistant/chat.ts`
- `lib/assistant/http.ts`
- `app/api/assistant/chat/route.ts`
- `app/api/assistant/actions/[id]/[action]/route.ts`
- `components/assistant-confirm-card.tsx`
- `tests/assistant.test.mjs`
- `tests/assistant-actions.integration.mjs`
- `tests/assistant.browser.spec.mjs`
- `scripts/assistant-test-server.mjs`
- `VOICE_ASSISTANT.md`

No further schema changes, package/dependency changes, environment edits or production deployment are part of Phase 2. Other pre-existing workspace changes remain separate.

## Validation and repeatable tests

Unit and mocked tool-loop tests:

```sh
npm test
npm run typecheck
```

The SQL integration test uses local in-memory PostgreSQL through PGlite, installed outside this repository. It never connects to Neon, even when production environment variables are loaded:

```sh
npm install --prefix /tmp/frtk-assistant-sql-validation --no-package-lock --ignore-scripts --no-audit --no-fund @electric-sql/pglite
TEST_PGLITE_MODULE=/tmp/frtk-assistant-sql-validation/node_modules/@electric-sql/pglite/dist/index.js node --import tsx tests/assistant-actions.integration.mjs
```

Optional actual Claude parsing of both reference sentences, with confirmation writes still confined to that local in-memory database:

```sh
TEST_REAL_ANTHROPIC=1 TEST_PGLITE_MODULE=/tmp/frtk-assistant-sql-validation/node_modules/@electric-sql/pglite/dist/index.js node --env-file=.env --env-file=.env.local --import tsx tests/assistant-actions.integration.mjs
```

Browser tests use a temporary development-only preview route and mocked UI responses, plus real unauthenticated API checks. They do not create a real account or tracker entry. Run the server in one terminal and tests in another:

```sh
node scripts/assistant-test-server.mjs
node node_modules/@playwright/test/cli.js test tests/assistant.browser.spec.mjs --workers=1
```

Stop the server with Ctrl+C to remove the preview route. The launcher refuses to overwrite an existing preview file. Screenshots go to ignored `test-results/`. This browser check establishes UI behavior with controlled responses; SQL integration and live Claude tests establish the parsing/save behavior separately.

## Completed Phase 2 checks

- 88 unit tests passed, including schema and mocked Claude tool-loop tests.
- Local PostgreSQL integration passed: both references, confirmation gate, ownership/chat scope, retry/double-confirm, cancellation, expiry, multiple sets, custom names, confirmed edits and rollback.
- Actual Claude parsed both reference sentences correctly; their confirmations wrote only to the isolated in-memory database.
- Two browser tests passed: real unauthenticated-route rejection and desktop/phone confirmation-card interactions with controlled responses. Screenshots were inspected.
- Production build passed, including TypeScript. Targeted ESLint and whitespace checks passed.
- All 84 generated client JavaScript files passed a scan for configured private server values.
- The temporary browser preview route was removed. This phase created no live Neon test records and has not been deployed.

## Remaining phases: voice implementation

Push-to-talk now uses the same assistant/draft flow as typing. Desktop supports press/hold and Space when an input is not focused. Touch supports tap-to-start/tap-to-send and holding. Clips shorter than 0.4 seconds are ignored; the microphone automatically stops and sends at 30 seconds. Recorder MIME selection prefers Opus/WebM and falls back to MP4 on Safari. Permission, recording, transcription, thinking, speaking and error states have text and an aria-live announcement. The microphone is released after sending, on failure and when leaving the screen.

The transcript appears in chat before the Claude reply. Voice replies are short and plain. Audio goes from ElevenLabs to the browser as a stream. Chrome uses MP3 MediaSource; browsers without that capability use native progressive audio through a short-lived encrypted ticket. The ticket is authenticated, user-bound, expires after 90 seconds, and avoids putting plaintext reply text in a playback URL. No audio file or transcript is stored by FirstRep; structured logging drafts are retained as described above. ElevenLabs' own processing/retention terms still apply.

Starting to talk stops playback and cancels the previous audio request. The speaker toggle mutes automatic spoken replies while leaving text visible. The app attempts to unlock native audio inside the initial gesture for iOS; if autoplay is blocked, the user can tap Listen. A subtle listening pulse respects reduced-motion preferences.

Voice confirmation runs on the server before any Claude call, using an exact phrase allowlist. It requires the reviewed action ID and authenticated owner/chat. “Yes”, “confirm” and “save it” save only the most recent pending draft, including inline edits. “Cancel”, “no” and “never mind” cancel it. Phrases such as “yes, add another set” are not confirmation commands. Transactional latest-draft checks prevent a stale selection from confirming a different draft. Confirmation retries return the original IDs. The UI collapses saved cards and links to the corresponding log.

Transcription and speech generation each use a shared per-user quota of 30 requests per minute through the existing Redis/Postgres rate storage. This reuses `firstrep_auth_limits`; no additional schema migration is needed. Provider keys remain server-only. The CSP permits same-origin and blob audio. The footer identifies Anthropic and ElevenLabs and retains “Educational tools. Not medical advice.”

### Voice configuration

```dotenv
ELEVENLABS_API_KEY=your-private-server-key
ELEVENLABS_VOICE_ID=your-selected-voice-id
ELEVENLABS_STT_MODEL=scribe_v2
ELEVENLABS_TTS_MODEL=eleven_flash_v2_5
```

Set these server variables in each deployment environment and redeploy for changes to take effect. The two model settings were added to the local environment and public configuration template, without changing existing keys. Text chat still works if speech is unavailable. The voice ID and TTS model are read from the environment rather than hardcoded in the assistant route.

| Route                               | Request                                                                                                             | Result                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `POST /api/assistant/transcribe`    | Multipart `audio` file and `durationMs`                                                                             | `{text}`                                |
| `POST /api/assistant/chat`          | Existing request plus `mode: "voice"`; for confirmation, `activeActionId` and optional edited `confirmationPayload` | Text, drafts and optional action result |
| `POST /api/assistant/speak`         | `{replyText}`                                                                                                       | Streamed `audio/mpeg`                   |
| `POST /api/assistant/speak`         | `{replyText, transport: "native"}`                                                                                  | Short-lived playback URL                |
| `GET /api/assistant/speak?ticket=…` | Encrypted ticket plus the signed-in session                                                                         | Native streamed `audio/mpeg`            |

The existing plan builder retains its current behavior and endpoints. The voice-specific routes validate sessions, origin, data types and sizes. FirstRep accepts only supported audio uploads; it never fetches a user-supplied audio URL.

API references checked: [ElevenLabs transcription](https://elevenlabs.io/docs/api-reference/speech-to-text/convert), [streaming speech](https://elevenlabs.io/docs/api-reference/text-to-speech/stream), [available model IDs](https://elevenlabs.io/docs/overview/models), and [MediaRecorder format detection](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static).

### Files added for voice

- `lib/assistant/voice.ts`
- `lib/assistant/voice-command.ts`
- `lib/assistant/voice-limit.ts`
- `lib/assistant/speech.ts`
- `lib/assistant/speech-ticket.ts`
- `app/api/assistant/transcribe/route.ts`
- `app/api/assistant/speak/route.ts`
- `components/use-assistant-voice.ts`
- `components/assistant-talk-button.tsx`
- `tests/assistant-voice.test.mjs`
- `tests/assistant-voice.browser.spec.mjs`
- `tests/fixtures/assistant-speech.mp3` (generated test speech, not a user recording)
- `scripts/check-assistant-voice.mjs`

The voice changes also extend the Phase 2 chat, schema, action and card files, `components/store.tsx`, `components/firstrep.tsx` (separate screen lifetimes so changing assistant/plan mode releases audio and clears chat), `app/globals.css`, `proxy.ts`, `.env.example`, the private local model settings, and the SQL integration test. `lib/database.ts` declares the same HttpError status property explicitly so the existing Node strip-types test runner can import the speech service. No package dependency was added.

### Voice test commands

```sh
npm test
TEST_PGLITE_MODULE=/tmp/frtk-assistant-sql-validation/node_modules/@electric-sql/pglite/dist/index.js node --import tsx tests/assistant-actions.integration.mjs
node scripts/assistant-test-server.mjs
# Separate terminal; run browsers sequentially:
node node_modules/@playwright/test/cli.js test tests/assistant-voice.browser.spec.mjs tests/assistant.browser.spec.mjs --workers=1 --output=test-results/voice-chrome
VOICE_TEST_BROWSER=webkit node node_modules/@playwright/test/cli.js test tests/assistant-voice.browser.spec.mjs --workers=1 --output=test-results/voice-webkit
# Optional actual ElevenLabs -> Claude -> ElevenLabs smoke test, no database:
node --env-file=.env --env-file=.env.local --experimental-strip-types scripts/check-assistant-voice.mjs
```

The browser tests use a synthetic stream with real Chrome MediaRecorder/Opus and a controlled MP4 recorder for phone-size WebKit. They play a generated MP3 through the actual browser audio element. These are engine/emulation checks; they do not replace a physical iPhone microphone and autoplay check.

Initial live provider measurements with the existing Sonnet model reached first reply audio at 5.7 seconds for the workout request and 4.3 seconds for food. Both transcribed and parsed correctly, preserving unknown food fields. Experimental Haiku checks measured 3.9/3.1 seconds (4.5) and 4.2/2.8 seconds (5.5). These checks are above the brief's 2.5-second target; streaming avoids full-audio buffering, but that end-to-end target is not yet demonstrated. No artificial acknowledgement audio is counted as a reply. These smoke tests create no live database records.

### Completed voice checks and limits

- 96 unit tests pass, including exact voice phrases, negative phrases, MIME fallback, ticket owner/expiry/tamper checks, input limits and first-chunk streaming.
- Local SQL integration covers voice provenance, latest-draft-only selection (including the transactional guard), edited confirmations, stable retry IDs, cancellation, owner/chat scope and expiry.
- Five Chrome voice browser tests and five phone-size WebKit voice tests pass. Chrome uses real MediaRecorder with a synthetic audio stream; WebKit uses a controlled MP4 recorder and actual native audio playback. Two existing typed-card browser tests also passed during this implementation.
- Actual ElevenLabs transcription and speech generation worked with the configured key and voice. Actual Claude correctly parsed the two spoken reference requests, with no live log writes.
- Physical iPhone microphone/autoplay behavior still needs an on-device check. Provider round trips remain above the 2.5-second target, as measured above. Model experiments do not change the app's configured Anthropic model.
- The existing plan builder keeps its original voice availability; the assistant advertises transcription and configured spoken output separately.

Final verification: production build (including TypeScript), targeted ESLint, SQL integration, and whitespace checks passed. All 86 generated client JavaScript files passed the configured-private-value scan. The temporary preview route and generated references to it were removed. The reviewed migration SQL hash is unchanged; no further live migration or test log writes were performed. Voice confirmation/cancellation uses its own control quota rather than consuming the Claude model quota.
