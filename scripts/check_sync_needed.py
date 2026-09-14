#!/usr/bin/env python3
"""
Check if new Riftbound sets exist in the API.

Fetches /sets from api.riftcodex.com and compares the set_ids to what's
already in the card_sets table. If new sets are found, exit with code 0
(sync needed). Otherwise exit with code 1 (sync not needed).

Run with:  npm run check-new-sets   (or: python3 scripts/check_sync_needed.py)
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from typing import Any

try:
    from curl_cffi import requests
except ImportError:
    sys.stderr.write(
        "Missing dependency 'curl_cffi'. Run: pip install -r scripts/requirements.txt\n"
    )
    sys.exit(1)

try:
    import psycopg
except ImportError:
    sys.stderr.write(
        "Missing dependency 'psycopg'. Run: pip install -r scripts/requirements.txt\n"
    )
    sys.exit(1)


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BASE_URL = "https://api.riftcodex.com"
PAGE_SIZE = 100
IMPERSONATE = "chrome120"
RETRY_BACKOFF_S = (2, 4, 8)  # transient 5xx retries

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent


# ---------------------------------------------------------------------------
# .env.local loader (mirrors scripts/migrate.mjs and sync_cards.py)
# ---------------------------------------------------------------------------

def load_dotenv_local() -> None:
    path = PROJECT_ROOT / ".env.local"
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip()
        if (val.startswith('"') and val.endswith('"')) or (
            val.startswith("'") and val.endswith("'")
        ):
            val = val[1:-1]
        os.environ.setdefault(key, val)


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

def make_session() -> requests.Session:
    return requests.Session(impersonate=IMPERSONATE)


def get_json(session: requests.Session, url: str, params: dict[str, Any] | None = None) -> Any:
    """GET with retry on transient 5xx. Aborts on 4xx or non-JSON body."""
    last_err: Exception | None = None
    for attempt, backoff in enumerate([0, *RETRY_BACKOFF_S]):
        if backoff:
            time.sleep(backoff)
        try:
            resp = session.get(url, params=params, timeout=30)
        except Exception as e:  # noqa: BLE001
            last_err = e
            continue
        if resp.status_code >= 500:
            last_err = RuntimeError(f"{url} → HTTP {resp.status_code}")
            continue
        if resp.status_code != 200:
            raise RuntimeError(
                f"{url} → HTTP {resp.status_code}\n"
                f"body (first 400 chars): {resp.text[:400]}"
            )
        ctype = resp.headers.get("content-type", "")
        if not ctype.startswith("application/json"):
            raise RuntimeError(
                f"{url} → non-JSON response (content-type={ctype!r}). "
                f"Cloudflare may be blocking. First 400 chars:\n{resp.text[:400]}"
            )
        return resp.json()
    raise RuntimeError(f"{url} failed after retries: {last_err}")


def paginate(session: requests.Session, path: str) -> list[dict[str, Any]]:
    """Fetch all items from a paginated endpoint."""
    items = []
    page = 1
    while True:
        body = get_json(
            session,
            f"{BASE_URL}{path}",
            params={"page": page, "size": PAGE_SIZE},
        )
        page_items = body.get("items") or []
        items.extend(page_items)
        total_pages = body.get("pages") or 1
        if page >= total_pages:
            break
        page += 1
    return items


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    load_dotenv_local()
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        sys.stderr.write("DATABASE_URL is not set. Add it to .env.local or set as env var.\n")
        return 1

    print("fetching /sets from api.riftcodex.com ...", flush=True)
    session = make_session()
    sets_raw = paginate(session, "/sets")
    api_set_ids = set()
    for s in sets_raw:
        if "set_id" not in s:
            sys.stderr.write(f"Warning: API response missing set_id field: {s}\n")
            continue
        api_set_ids.add(s["set_id"])
    print(f"found {len(api_set_ids)} set_ids in API", flush=True)

    print("checking database for existing sets ...", flush=True)
    try:
        with psycopg.connect(db_url) as conn:
            with conn.cursor() as cur:
                cur.execute('SELECT DISTINCT set_id FROM card_sets WHERE set_id IS NOT NULL')
                db_set_ids = {row[0] for row in cur.fetchall()}
    except Exception as e:
        sys.stderr.write(f"Database error: {e}\n")
        return 1
    print(f"found {len(db_set_ids)} set_ids in database", flush=True)

    new_sets = api_set_ids - db_set_ids
    if new_sets:
        print(f"new sets detected: {sorted(new_sets)}", flush=True)
        print("sync is needed", flush=True)
        return 0
    else:
        print("no new sets found", flush=True)
        print("sync is not needed", flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
