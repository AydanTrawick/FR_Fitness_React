# Free Exercise DB integration

Run `npm run db:seed-free-exercises` from `frtk-web` with `NEON_DATABASE_URL` in `.env`. The command fetches the [upstream combined JSON](https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json), applies `database/005_free_exercise_db.sql`, and imports the exercises in batches. It is safe to rerun to refresh upstream records. No user workout or favorite records are deleted.

The database already contained an empty upstream-shaped `exercises` table, so the migration extends it with `primary_muscle`, `movement_pattern`, `is_compound`, `metadata`, and `source`. It copies the original FirstRep exercise IDs into the same table and changes the favorite and saved-workout foreign keys to `exercises.id`. Original FirstRep exercise details are kept in `metadata`.

`GET /api/exercises` is public and supports `muscle`, `equipment`, `search` (or `q`), and `limit` (1–1000). Filters are case-insensitive. Muscle matches primary or secondary muscles. The database stores source-relative image paths; the API returns full URLs using the [upstream image prefix](https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/). Three upstream exercises have no images and use a local placeholder in the library.

The existing library loads this API, then uses the same IDs for favorites and saved workouts. Its bundled 85-item list remains available when the database catalog is offline. The seed currently imports 876 upstream records, alongside the 85 preserved FirstRep records.
