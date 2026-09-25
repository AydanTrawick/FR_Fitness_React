# FirstRep exercise library

The feature lives inside the existing Next.js App Router application and its hash-based navigation. Open `/#exercises`, `/#favorites`, `/#builder`, or `/#saved`. Existing account sessions, PostgreSQL connection, trackers and AI tools are reused.

## Data and images

- `scripts/build-exercise-catalog.mjs`: explicit, visually reviewed image mappings and metadata.
- `scripts/exercise-guidance.mjs`: original editorial movement instructions, common mistakes and cues. General education, not individualized exercise prescriptions. Difficulty is an editorial catalog classification.
- `lib/exercises.json`: generated catalog, currently 85 exercises. Each supports an image array for future galleries.
- `lib/exercise-image-review.json`: five uploaded images intentionally excluded pending review. Includes the potentially mislabeled machine chest press and straight-arm pulldown. No files were discarded.
- `public/exercises/`: uploaded images served through Next Image, using containment to preserve the full demonstration. No replacement images or video controls were generated.

All 90 files in `images/` are accounted for. No exercise videos were found. Add an explicit row and verified imagery to the catalog builder, add editorial guidance, run `npm run catalog:build`, then `npm run db:exercises`. The copy step refreshes images whose size or source modification time changed. Review new images visually; filenames alone are not authoritative.

## Database

`database/003_exercise_library.sql` adds catalog, exercise favorites, saved workouts and ordered workout exercises. It leaves completed workout logs untouched. The migration and seed were applied successfully to the currently configured database.

For another environment, apply existing migrations 001 and 002 first, then run:

```sh
npm run db:exercises
```

This reads `NEON_DATABASE_URL` from `.env`, applies migration 003 and upserts catalog metadata. Do not expose this variable to the client. Account-required endpoints use the existing server session, reject foreign origins and scope all workout operations to the authenticated user. Writes use transactions and saved-workout edits include a timestamp conflict check. Favorites have a composite primary key to prevent duplicates.

## Interaction details

Search, primary-muscle, equipment and difficulty filters combine. Only represented filter options are offered. Details include technique, alternatives and a gallery when multiple images exist. Favorites and workouts persist in PostgreSQL. Guests may explore and compose a draft, then sign in to save.

Drafts are backed up in browser session storage, scoped by account, with an unload warning for unsaved changes. Guest drafts transfer when signing in. Browser storage is a recovery mechanism, not the saved-workout database. Reordering uses accessible up/down buttons. Prescriptions support reps or seconds, kilograms, rest and notes. Independent duplicates receive new IDs; deletion asks for confirmation. Saves report success only after the database confirms persistence.

The AI plan tool offers **Review & save workout**. It preserves the original generated text and matches catalog exercise names. Prescription fields start with explicitly marked defaults: users must review sets/reps/rest and unmatched movements before saving. It does not silently turn arbitrary meal plans or unstructured prose into verified prescriptions.

## Files

Core UI: `components/exercise-library.tsx`, `app/exercises.css`.
Integration: `components/firstrep.tsx`, `components/tools.tsx`, `app/layout.tsx`, `app/globals.css`.
Data/API: `lib/workouts.ts`, `lib/exercise-server.ts`, `lib/import-workout.ts`, `app/api/[...path]/route.ts`.
Setup: catalog/seed scripts, migration 003, `package.json`, `package-lock.json`.
Validation: `tests/exercises.test.mjs`, `tests/library.integration.mjs`, `tests/browser.spec.mjs`.

## Validation

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run start -- --port 3020
# In another terminal, with the same configured database:
npm run test:library
npm run test:browser
```

`TEST_BASE_URL` can override `http://localhost:3020`. Browser tests default to installed Google Chrome; set `PLAYWRIGHT_CHANNEL=chromium` after installing Playwright Chromium if preferred. Integration/browser tests create uniquely named disposable accounts and clean up only those accounts and their dependent records. Do not run them against an unrelated service.

Verified: all 12 unit tests, lint, TypeScript, production Webpack build, API persistence/ownership/CSRF/conflict checks, and two browser workflow tests covering guest draft recovery, filters/details, mobile overflow and signed-in create/edit/favorite/duplicate/delete flows, including failed-request feedback. Test accounts were cleaned up.

Checks were run on a temporary local copy because iCloud was offloading project files during reads. The validated source was copied back into this project. Webpack is used for both development and production because the existing external node_modules symlink is incompatible with Turbopack's filesystem root. Tailwind scans only application source; the iCloud-created `node_modules 2` directory is excluded from lint and TypeScript.
