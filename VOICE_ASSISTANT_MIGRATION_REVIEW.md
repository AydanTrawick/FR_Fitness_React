# Voice Training Assistant migration review

Status: **applied to Neon after user approval**, on 2026-10-14 at 20:21:08 UTC. The exact reviewed SHA-256 below was applied successfully in one transaction. No live database connection was made during the initial preparation/review. This review covers schema preparation only, not the subsequent assistant implementation or deployment.

Post-application verification used a read-only transaction: the migration ledger entry, all 23 expected new/changed columns, and all four pending-action indexes were verified. The draft table contained zero rows. No test records were inserted into Neon. The SQL file is unchanged from the reviewed copy; its original review-status comment is retained to preserve the approved hash.

## Every project file in this change

| File | Change | Purpose |
| --- | --- | --- |
| `database/011_voice_assistant.sql` | New | Complete transactional SQL migration. |
| `scripts/migrate-assistant.mjs` | New | Preview by default; explicit execution requires the reviewed SQL hash. |
| `VOICE_ASSISTANT_MIGRATION_REVIEW.md` | New | This file: scope, database changes, validation and execution details. |

No existing project files were edited for this migration review. Existing unrelated workspace changes are excluded. No environment files, package manifests, authentication code, UI files or deployment configuration are changed. Running the migration writes no project files: it reads the runner and SQL, loads the already-installed `postgres` dependency, and takes `NEON_DATABASE_URL` from the process environment. If Node's `--env-file` option is used later, those environment files are read, not modified.

## Every database object affected

### New `public.pending_log_actions`

Columns: `id`, `user_id`, `conversation_id`, `kind`, `source`, `payload`, `status`, `idempotency_key`, `created_at`, `expires_at`, `confirmed_at`, `result_ids`.

This stores an action awaiting user confirmation. `payload` contains structured logging data; there is no audio or conversation transcript column. The owner references `public.firstrep_users(id)` with `ON DELETE CASCADE`. Conversation IDs scope confirmations to the current chat. Expiry defaults to 30 minutes; application code must enforce expiry. Confirmed result IDs allow retry responses to return the original records.

Indexes: primary key on `id`; unique index on `idempotency_key`; `pending_log_actions_owner_chat_time_idx` on `(user_id, conversation_id, created_at DESC, id)`; `pending_log_actions_expiry_idx` on `expires_at` for pending rows.

Constraints enforce the owner foreign key, allowed action kinds/sources/statuses, an object payload, a nonblank bounded idempotency key, expiry after creation, no null result IDs, and a confirmation timestamp plus nonempty results only for confirmed actions. The future confirmation endpoint must also check authenticated ownership, validate the payload, lock the draft, and insert logs plus mark the draft confirmed in one transaction. This migration does not implement that endpoint.

### Existing `public.firstrep_workout_entries`

| Field | Change |
| --- | --- |
| `rpe` | Allow NULL when effort was not provided; retain existing numeric checks. |
| `source` | New, required; default `legacy`; allowed `legacy`, `manual`, `text`, `voice`. |
| `weight_as_entered` | New, nullable; preserve the stated weight. |
| `weight_unit` | New, nullable; allowed `lb`, `kg`, `bodyweight`. |

Adds `firstrep_workout_source_check`, `firstrep_workout_entered_weight_check`, and `firstrep_workout_unit_check`. Entered weight and unit must form a valid pair; bodyweight permits NULL or zero entered weight. Canonical `weight_kg`, exercise references, dates, reps, sets, notes and existing numeric values remain unchanged. Historical units are not guessed.

### Existing `public.firstrep_food_entries`

| Field | Change |
| --- | --- |
| `protein_g`, `carbs_g`, `fat_g` | Allow NULL for unstated nutrients; retain existing numeric checks. |
| `meal` | New, required; default `unspecified`; allowed breakfast/lunch/dinner/snack/unspecified. |
| `calories` | New, nullable; numeric range check 0–100,000. |
| `values_source` | New, required; default `legacy`; allowed `legacy`, `user_stated`, `assistant_estimate`. |
| `source` | New, required; default `legacy`; allowed `legacy`, `manual`, `text`, `voice`. |

Adds inline checks for the four new columns. Existing nutrient values, including zeros, are preserved. No calories are backfilled or derived. For a future request such as “Steak, 40 g protein,” unstated carbs, fat and calories can remain NULL.

### Migration ledger and owner reference

`public.firstrep_schema_migrations` is reused, or created if absent with `name` (primary key) and `applied_at`. One row is inserted: `database/011_voice_assistant.sql`.

`public.firstrep_users` is referenced by the new foreign key, which adds PostgreSQL foreign-key enforcement metadata. No user columns or user records are changed. No other tables are altered. The migration does not insert workout/food records, delete records, seed exercises, or run another migration.

## Existing records and rollout boundary

Existing records acquire `legacy` provenance defaults. Existing food records have meal `unspecified`; new calories and original-weight fields remain NULL. Existing numeric values are not rewritten.

Before enabling assistant confirmations, the application must preserve nullable values and the new metadata through reads, displays and log edits. Current coercion and whole-list rewrite paths are not yet upgraded by this migration. Schema preparation alone does not activate voice logging. A later implementation review will identify its own application files.

## Execution controls

The SQL is one transaction with a migration advisory lock, a 5-second lock timeout and a 30-second statement timeout. DDL can briefly block concurrent access. Errors roll back the transaction; conflicting pre-existing columns or the draft table fail rather than silently accepting an unreviewed schema. The runner skips an already-recorded migration while holding the advisory lock.

There is no automatic build/deploy hook and no destructive rollback script. Once new NULL values are used, restoring NOT NULL constraints would require a separate data review.

Reviewed SQL SHA-256:

```text
cfec8c8cdcd23ac1a5f33267d2196172508ef81e1f101aa4d36068387ccfd0a6
```

Safe preview, without a database connection:

```sh
node scripts/migrate-assistant.mjs
```

Explicit execution command, run after the user approved this review. It requires `NEON_DATABASE_URL` to already be securely supplied in the environment:

```sh
node scripts/migrate-assistant.mjs --apply --reviewed-sha256 cfec8c8cdcd23ac1a5f33267d2196172508ef81e1f101aa4d36068387ccfd0a6
```

Any SQL change invalidates that hash and requires updating the review. The runner logs the target hostname/database path, never the database credentials.

## Validation completed without Neon

- Parsed and executed the SQL in an isolated, in-memory PostgreSQL environment using PGlite, with fixture tables and records.
- Checked exact preservation of existing workout and food values.
- Checked nullable RPE and sparse nutrients, entered units, invalid metadata rejection, duplicate idempotency-key rejection, confirmation-state constraints and account-deletion cascade.
- Checked runner JavaScript syntax and preview output.
- Checked that an incorrect reviewed hash aborts before any database connection.

These checks validated the migration against the local baseline schema. After user approval, a live schema inspection confirmed the expected baseline; the exact reviewed migration was then committed and verified through read-only queries as recorded above.

Source: `FirstRep Voice Training Assistant — Build Brief.pdf`, schema requirements and phase boundaries. PGlite documentation: https://pglite.dev/docs/.
