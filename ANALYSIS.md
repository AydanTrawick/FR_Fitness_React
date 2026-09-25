# Analysis

Open `/analysis` or select **Your Analysis** in the dashboard navigation.

The page uses the existing account session and PostgreSQL connection. Install its additive schema with:

```sh
node --env-file=.env scripts/migrate-analysis.mjs
```

The migration was applied to the configured database during implementation. It preserves all existing logs. The query layer makes three parallel requests (activity/schedule, body measurements, library), caches by user/range for five minutes, and isolates failures by group. Existing log and library writes invalidate the user's analysis cache.

## Existing-data compatibility

- Existing workout entries are grouped by their recorded calendar date and labeled as training days. Multiple workouts on the same date cannot be separated retrospectively. The new session/set tables support precise sessions and warmup flags.
- Historical entries do not identify warmups. Explicit warmup sets in the new schema are excluded from volume and strength calculations.
- Historical logs do not record duration, planned sessions, or saved-workout session links. These are not invented: duration/adherence stay unavailable and saves are described as having no *linked* activity. The current app has no workout execution flow, so saved-workout actions open their library entry rather than automatically starting a session.
- Existing body measurements are reused in kg. The analysis unit selector persists a browser preference; timezone is detected in the browser and sent in the URL. Without JavaScript or an explicit `tz`, dates initially use UTC.
- Range selection applies to displayed activity, balance, strength, body and library counts. Rolling frequency always compares the most recent four weeks with the preceding four; the calendar always covers twelve weeks. “All” has no prior-period delta.
- Cardio, isolation and unknown exercises without a six-pattern classification remain unclassified; pattern percentages are explicitly labeled as a share of classified volume.
- Nutrition is optional and is not included. No weight targets, body scores, or comparisons to other users are computed.

## Verification

```sh
node --experimental-strip-types --test tests/analysis.test.mjs
node --experimental-strip-types scripts/seed-analysis.mjs 60
```

The seed generator produces deterministic JSON only; it never adds fictitious history to real accounts. Tests cover empty, single-session, warmup-only, missing-weight, timezone, date-range, median duration, schedule, strength, body and insight behavior.

Build/browser verification used a temporary local copy because iCloud placeholder reads in the workspace stalled. TypeScript source checks and targeted lint passed there. Browser checks exercised the real guest route and seeded 0/2/60-session component views at 375px, without horizontal overflow or browser exceptions. The populated fixture scored 100 in Lighthouse accessibility. The seeded route exists only in that temporary verification copy and is not shipped.

Dependencies are linked to `/Users/Aydan/Developer/firstrep-analysis-runtime/node_modules` to keep them outside iCloud. The newly installed iCloud copy was retained at `../.firstrep-analysis-node-modules-backup`; the failed temporary install was removed. This is local setup, not a deployment requirement.

Remaining product integrations: capture session boundaries/warmups and schedule links in the workout logger; integrate a true one-click saved-workout execution flow; share the analysis unit preference with the other trackers. Query latency against 500 real sessions and an authenticated production Lighthouse run still need measurement; the seed tests do not certify the 500ms TTFB target.
