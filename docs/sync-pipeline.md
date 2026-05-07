# Card sync pipeline — how to run it

Pulls the Riftbound card catalogue from `api.riftcodex.com` into our Postgres.
Single transaction, all-or-nothing: a mid-run failure leaves the DB unchanged.

For background on the schema it writes to, see `docs/database.md`. For the API
quirks it works around, see `docs/api.md`.

## One-time setup

From `NextJs/riftbrewery/`:

```bash
# 1. Make sure DATABASE_URL is in .env.local
grep '^DATABASE_URL=' .env.local

# 2. Apply all migrations (creates the tables the pipeline writes to)
npm run migrate

# 3. Create a Python venv and install the two deps
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements.txt
```

The two deps are `curl_cffi` (TLS fingerprinting to get past Cloudflare) and
`psycopg[binary]` (Postgres driver). Both pinned in
`scripts/requirements.txt`.

Python 3.11+ recommended. 3.9 works but the script uses
`from __future__ import annotations` to keep newer type syntax happy.

## Running it

```bash
source .venv/bin/activate     # if not already in the venv
npm run sync-cards
```

That's it. Equivalent to `python3 scripts/sync_cards.py`.

Expected output:

```
fetching /sets ...
fetching /cards (size=100) ...
normalising cards ...
fetching /index/* ...
writing to postgres ...
done. sets=7 cards=1064 indexes=11 in 7.2s
```

The exact counts will drift as Riot adds cards and sets. As long as the line
starts with `done.` and `cards=` is non-zero, you're good.

## Verifying the run

```bash
# Replace with your DATABASE_URL one-liner if your shell strips it.
DB="$(grep '^DATABASE_URL=' .env.local | cut -d= -f2- | tr -d "'\"")"

psql "$DB" -c "SELECT count(*) FROM cards;"
psql "$DB" -c "SELECT count(*) FROM card_sets;"
psql "$DB" -c "SELECT type, count(*) FROM cards GROUP BY type ORDER BY count(*) DESC;"
```

Re-run the sync — it should be idempotent (counts unchanged, `synced_at`
advances):

```bash
npm run sync-cards
```

## When it fails

Common modes and what to do.

**`done. sets=0 cards=0 indexes=11`**
Pagination mismatch. The API moved to a new shape. Run
`scripts/probe.py` (write one if it's gone) to see the real keys, then patch
`paginate()` in `scripts/sync_cards.py`.

**`failed to normalise card id=... unrecognised classification.type 'Foo'`**
The API introduced a new card type. Add it to the `mapping` dict in
`normalise_type()` (or to `ALLOWED_TYPES` if it slots cleanly into our union)
in `scripts/sync_cards.py`.

**`cards reference set_ids not in /sets response`**
A card's `set.set_id` points at a set the `/sets` endpoint didn't return.
Either Riot is mid-deploy or the `/sets` pull is paginating wrong. Re-run
once; if it persists, probe `/sets` directly.

**Cloudflare 403 / non-JSON response**
The `chrome120` impersonate target stopped working. Edit
`scripts/sync_cards.py`'s `IMPERSONATE` constant — try `chrome124` or
`safari17_0` (both confirmed working as of last check).

**`UniqueViolation` on insert**
A new column got a unique constraint we didn't intend. Look at the message:
it names the constraint. Decide whether to drop the constraint
(`riftbound_id` was the precedent — see `0005_riftbound_id_not_unique.sql`)
or dedupe in Python before upserting.

**Anything else**
The script logs the offending payload before exiting non-zero. Read it,
patch the normaliser, re-run.

## Operating cadence

Manual for now. Re-run weekly on Sundays, or whenever you suspect the
catalogue has changed (a new set drops, alt-art releases, etc.). Cron isn't
wired up yet — when we add it, the command stays the same.

## Files involved

- `scripts/sync_cards.py` — the pipeline.
- `scripts/requirements.txt` — Python deps.
- `scripts/probe.py` — throwaway debugger for API shape (delete and rewrite
  as needed).
- `migrations/0004_card_full_schema.sql` — creates the tables.
- `migrations/0005_riftbound_id_not_unique.sql` — relaxes a constraint.
