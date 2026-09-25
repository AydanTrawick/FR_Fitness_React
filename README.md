# FirstRep — Next.js migration

FirstRep’s Streamlit tracker workflows rebuilt with Next.js App Router, React, TypeScript, Tailwind CSS 4, and responsive CSS. TypeScript compiles to JavaScript; the main web app no longer needs Streamlit or a Python runtime.

## Run

Use Node 22.20 or newer. Run these commands inside `frtk-web`:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Guest mode works without credentials. Guest logs survive refreshes within the browser tab using `sessionStorage`; export a CSV before closing the session. No sample health or training data is preloaded.

You can also run `npm run dev` from the enclosing `FRTK react` folder; its package script forwards to this app. Development uses webpack so dependencies linked outside the project work correctly.

On this Mac, iCloud offloaded dependencies, build caches, and several source files, blocking startup and compilation. This workspace now links `node_modules` to the installed dependencies at `/Users/Aydan/Developer/firstrep-next/node_modules`; keep that directory available. The offloaded dependencies, cache, and source originals are preserved in `.firstrep-*-backup` folders alongside `frtk-web`. Source files restored from the local copy remain in this workspace. Run and edit this workspace; older copies can start without its service settings. If reinstalling dependencies, use a folder outside iCloud or keep the project downloaded in Finder.

## Implemented

- Dashboard with real daily nutrition/strength totals, recent activity, and seven-day volume chart.
- Adult BMI with metric/imperial input, classification, reference range, saved history and validation.
- Strength log: date, exercise suggestions, grouped or individual sets, reps, kg/lb, half-point RPE, notes, and derived volume.
- Food log: all 18 original common foods, g/oz/lb portions, manual macros, daily totals, and optional USDA search. Calories retain the original 4/4/9 calculation.
- Editing, deletion confirmation, CSV export and validated CSV replacement for every tracker. Original Streamlit tracker exports use the same headers and are accepted. CSV imports do not import account IDs.
- All five original workout programs and 22 training days, including exercises, rest, equipment and durations. Program Markdown download.
- Original glossary and training/nutrition guide content with search.
- Optional Neon sign-in/registration/logout and tracker persistence compatible with existing FirstRep accounts. Password hashing matches Python's PBKDF2-SHA256 / 240,000 iterations. Sessions use hashed opaque tokens, revocation, expiry and HttpOnly cookies.
- Explicit guest-to-account import. Account data is not stored in browser storage. Server writes validate inputs, scope to the authenticated owner, commit transactionally, and reject conflicting tracker snapshots.
- Optional Anthropic text plan drafts and a text training assistant, with conversational follow-ups and Markdown export for plans.
- Optional equipment classification through the existing FastAPI model service, including image preview, top predictions, corrected labels, local feedback download, and feedback upload to Cloudflare R2.
- Optional spoken assistant replies and voice-recorded prompts via ElevenLabs text-to-speech/speech-to-text.
- Optional emailing of AI plan drafts to the signed-in account via Gmail SMTP.

## Connect services

Copy `.env.example` to `.env.local`. Supply only the services you need. Restart the app after changing settings. No real credentials from the uploaded ZIP were imported.

| Variable | Enables |
| --- | --- |
| `NEON_DATABASE_URL` | Existing accounts and server-backed tracker logs |
| `USDA_API_KEY` | FoodData Central search |
| `ANTHROPIC_API_KEY` | Text AI plan drafts and assistant (also requires an account) |
| `ANTHROPIC_MODEL` | Anthropic model available to your account; defaults to `claude-sonnet-4-6` |
| `EQUIPMENT_API_URL` | Base URL of the original equipment API, e.g. `http://127.0.0.1:8080` |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Spoken assistant replies (text-to-speech) and voice prompts (speech-to-text) |
| `EMAIL_ADDRESS`, `EMAIL_PASSWORD` | Emailing AI plan drafts to the signed-in account, via Gmail SMTP (use an [App Password](https://myaccount.google.com/apppasswords), not your login password) |
| `STORAGE_BACKEND=r2`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Uploads equipment-classifier feedback to Cloudflare R2 instead of local-only download |

All credentials are server-only. No variable needs a `NEXT_PUBLIC_` prefix.

For a new database, apply `database/001_trackers.sql` and `database/002_sessions.sql`. Both preserve existing tables/data. An existing Streamlit database generally already contains the tracker and session tables; review its schema before applying migrations. No live database migrations were run during this conversion. Use HTTPS for production cookies.

Equipment inference still uses the separately deployed trained PyTorch model. The Next.js server forwards the image to its `/classify-equipment` endpoint; the 45 MB `.pth` model and Python virtual environment are not copied into the browser app.

Provider references: [Claude Messages API](https://platform.claude.com/docs/en/api/overview), [USDA API guide](https://fdc.nal.usda.gov/api-guide/).

## Scope differences from Streamlit

This is the core web migration, not complete feature parity with every service in the ZIP. These features are **not yet migrated**:

- Assistant tool calls that write/delete activity, confirmation receipts, undo, persisted conversations, active plans and their edits.
- The original structured plan schemas, allergy/ingredient/calorie/injury rule validation and automatic repair loop. New AI responses are explicitly unvalidated drafts, not replacements for that validated plan pipeline.
- Separate profile/budget meal-planning wizard and PDF export. Plan drafts can be emailed as plain text/Markdown (see `EMAIL_ADDRESS`/`EMAIL_PASSWORD` above), not exported as PDF.
- USDA household-measure portions (mass units are supported).
- Feedback admin/review and model training export/retraining. Feedback can be uploaded to R2 (see above) but is not otherwise processed.
- Store product/order admin pages and role administration.
- Standalone Recovery and Enhancers pages and their images.

AI tools require sign-in. Their request limit is process-local, not a durable multi-instance billing quota. Add shared rate limiting and deployment-specific request-size limits before exposing paid provider routes at scale. Guest data uses browser-tab storage rather than account storage. The old assistant's separate `activity_logs` records are not included in manual-tracker totals, matching the original separation.

## Validation

```sh
npm run lint
npm test
npm run build
```

Tests cover calculation boundaries, unit conversions, log validation, quoted/multiline CSV roundtrips and Streamlit CSV compatibility. Browser checks verified desktop and 390 px phone layouts, navigation, workout saving/refresh/editing, and food totals. HTTP checks verified authentication gates, missing-service responses, and cross-origin mutation rejection. Build and lint were run against the local copy because the original iCloud directory blocked dependency reads. Live Neon and paid provider integrations require configuration and have not been exercised against your accounts.

## Layout

- `components/`: dashboard, trackers, program/guide library, service tools and session store.
- `lib/tracking.ts`: shared input schemas, formulas, units and CSV parsing.
- `lib/content.json`: literal program/food/glossary/guide data extracted from the uploaded Python source without executing it.
- `lib/server.ts`: server-only database, sessions and upstream request helpers.
- `app/api/[...path]/route.ts`: account, tracker, USDA, equipment, AI, voice (ElevenLabs), email and feedback-storage (R2) API endpoints.
- `app/globals.css`: responsive FirstRep design with Tailwind available for extensions.
- `database/`: compatible SQL setup scripts; never executed automatically.
