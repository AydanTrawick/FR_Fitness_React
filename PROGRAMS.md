# FirstRep programs

The five original routines live in `lib/content.json`. Each program now has a level, primary goal, focus scores (1–5), and a seven-day schedule. Exercise metadata includes curated coaching cues, alternatives, catalog IDs where available, and `restSeconds`. Focus scores describe each routine’s emphasis; they are editorial, not calculated training outcomes.

## Database

Run the additive migration against the same Neon database used by the application:

```sh
node --env-file=.env --env-file=.env.local scripts/migrate-programs.mjs
```

Bookmarks and swaps belong to the signed-in user. Each program day has one resumable session per Monday-start week, using the account’s timezone. Only actual logged sets count toward set progress. Marking a day complete manually never invents entries for unfinished sets.

Strength sets also enter the existing Workout Log, using kilograms internally and preserving session notes. Timed and distance work stays in program set records, with seconds or meters, rather than fake repetitions. All program records are included in account data exports and cascade on account removal.

Set submissions are transactional and unique by session, exercise slot, and set number. Retries are safe after a lost response. Swaps lock for a movement once its first set is saved. Sessions snapshot the user’s exercise choices so future content changes do not rewrite a workout already started.

The existing whole-log update preserves linked program sets through a deferred foreign key. Removing a logged row or changing its exercise removes its program completion slot; editing weight/reps updates the linked set. Automatic day completion clears when a linked set is removed.

## Screens and checks

- `/programs` and the dashboard’s Programs section: client filters, bookmarks, week strips, previews and workout links. Session-length filtering uses the longest day; an exact 60-minute program matches both 45–60 and 60+.
- `/programs/[programId]?day=1`: day tabs, weekly completion, cues, actual-set logging, swaps and computed muscle-set totals.
- `/programs/[programId]/workout/1`: one exercise at a time, account-unit steppers, effort, rest countdown, resume and completion.

Run `node --experimental-strip-types --test tests/programs.test.mjs` for program data and measurement checks. With the local auth-test server on port 3026 and private environment loaded, run `tests/programs.browser.spec.mjs` with Playwright for persistence, ownership, interrupted/concurrent saves, mobile sizing and completion checks. Browser fixtures are disposable verified accounts and are removed afterward.
