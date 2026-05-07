# Migrations

Plain numbered SQL files. A tiny runner (`scripts/migrate.mjs`) applies any
file that's not yet in the `schema_migrations` table, in filename order, inside
a transaction.

## File naming

`NNNN_short_description.sql` — four-digit zero-padded number, lowercase, words
separated by underscores. Example: `0003_add_deck_tags.sql`.

Numbers must be unique and monotonically increasing; filename order *is* the
apply order.

## Adding a new migration

1. Create `migrations/NNNN_whatever.sql` with the next free number.
2. Write idempotent SQL where reasonable (`IF NOT EXISTS`, etc.) so reruns are
   safe if a migration crashes halfway.
3. `npm run migrate`.

The runner will skip any migration already recorded in `schema_migrations` and
apply the rest.

## First-time setup (milestone 2)

The app used to point at a `riftbrewery_auth` database. We're consolidating to
a single `riftbrewery` DB that holds users, cards, and decks.

Two options — pick one:

### Option A: rename the existing DB (preserves your smoke-test user row)

```sql
-- Run in psql, connected to any DB other than riftbrewery_auth
-- (e.g. `\c postgres` first).
ALTER DATABASE riftbrewery_auth RENAME TO riftbrewery;
```

Then edit `.env.local`:

```diff
- DATABASE_URL=postgresql://postgres:Growapair123!@localhost:5432/riftbrewery_auth
+ DATABASE_URL=postgresql://postgres:Growapair123!@localhost:5432/riftbrewery
```

### Option B: fresh DB (discards the existing user row)

```sql
CREATE DATABASE riftbrewery;
```

Then update `.env.local` as above.

### Run the migrations

```bash
npm run migrate
```

Expected output:

```
apply 0001_users.sql
apply 0002_cards_and_decks.sql
done. 2 migration(s) applied, 0 skipped.
```

Re-running is a no-op:

```
skip  0001_users.sql (already applied)
skip  0002_cards_and_decks.sql (already applied)
done. 0 migration(s) applied, 2 skipped.
```

## Verification

Connect to `riftbrewery` and run:

```sql
\dt
```

You should see: `cards`, `deck_cards`, `decks`, `schema_migrations`, `users`.

```sql
SELECT id, applied_at FROM schema_migrations ORDER BY id;
```

Should return both migration files.
