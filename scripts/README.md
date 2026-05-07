# scripts

Operational scripts for RiftBrewery. Two of them: a Node migration runner and
a Python card sync pipeline.

## `migrate.mjs` — apply SQL migrations

```bash
npm run migrate
```

Reads numbered files from `migrations/`, applies any not yet recorded in the
`schema_migrations` table, and runs each one in a transaction. See
`migrations/README.md` for details.

## `sync_cards.py` — pull the Riftbound catalogue

Pulls sets, cards, and filter-index helpers from the Riftcodex API
(`https://api.riftcodex.com`) into Postgres. All-or-nothing transaction:
if anything fails mid-run, the DB is unchanged.

### Prereqs

- Python 3.11+.
- A virtualenv (recommended) with the deps installed:

  ```bash
  python3 -m venv .venv
  source .venv/bin/activate
  pip install -r scripts/requirements.txt
  ```

  You can also `pip install --user -r scripts/requirements.txt`. On modern
  Linux distros that gripe about PEP 668, add `--break-system-packages`.
- `DATABASE_URL` set in `.env.local`.
- Migrations applied through `0004_card_full_schema.sql`.

### Run

```bash
npm run sync-cards
```

(Equivalent to `python3 scripts/sync_cards.py`.)

Expected output, roughly:

```
fetching /sets ...
fetching /cards (size=100) ...
normalising cards ...
fetching /index/* ...
writing to postgres ...
done. sets=3 cards=532 indexes=11 in 4.2s
```

### Why Python and not Node?

Cloudflare blocks plain Node `fetch` against `api.riftcodex.com` with a 403
challenge. The fix is to send TLS handshakes that look like a real browser —
`curl_cffi` does that out of the box (`impersonate="chrome120"`). Node has
equivalents but they're flakier; Python here is the small price.

### Manual cron later

When we add scheduling, the cron command is the same. Until then it's a
manual run.
