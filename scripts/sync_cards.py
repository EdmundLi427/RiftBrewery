#!/usr/bin/env python3
"""
Sync the Riftcodex card catalogue into our Postgres.

Pulls /sets, /cards (paginated), and /index/* helpers in a single transaction
and upserts everything. All-or-nothing: a mid-run failure leaves the DB
untouched.

Cloudflare blocks plain Node fetch, so we use curl_cffi which impersonates
a real Chrome TLS fingerprint.

Run with:  npm run sync-cards   (or: python3 scripts/sync_cards.py)
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Iterable

try:
    from curl_cffi import requests
except ImportError:
    sys.stderr.write(
        "Missing dependency 'curl_cffi'. Run: pip install -r scripts/requirements.txt\n"
    )
    sys.exit(1)

try:
    import psycopg
    from psycopg.types.json import Jsonb
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

INDEX_NAMES = [
    "keywords",
    "card-names",
    "card-types",
    "card-supertypes",
    "domains",
    "rarities",
    "artists",
    "energy",
    "might",
    "power",
    "tags",
]

# Closed set of types our app understands. Pipeline aborts if the API returns
# anything else, so an upstream change can't silently corrupt our schema.
ALLOWED_TYPES = {
    "legend",
    "unit",
    "champion_unit",
    "spell",
    "gear",
    "rune",
    "battlefield",
}

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent


# ---------------------------------------------------------------------------
# .env.local loader (mirrors scripts/migrate.mjs)
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


def paginate(session: requests.Session, path: str) -> Iterable[dict[str, Any]]:
    """Yield items from a paginated /cards or /sets endpoint.

    The actual API shape (despite the published spec) is:
      { "items": [...], "total": N, "page": P, "size": S, "pages": T }
    Page numbers are 1-indexed; iterate while page < pages.
    """
    page = 1
    while True:
        body = get_json(
            session,
            f"{BASE_URL}{path}",
            params={"page": page, "size": PAGE_SIZE},
        )
        items = body.get("items") or []
        for item in items:
            yield item
        total_pages = body.get("pages") or 1
        if page >= total_pages:
            break
        page += 1


# ---------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------

def normalise_type(api_type: str | None, supertype: str | None) -> str:
    """Map API classification.type + supertype to our internal type union."""
    if not api_type:
        raise ValueError("card classification.type is missing")
    if (supertype or "").strip().lower() == "champion" and api_type.strip().lower() == "unit":
        return "champion_unit"
    raw = api_type.strip().lower()
    mapping = {
        "unit": "unit",
        "spell": "spell",
        # API uses "Gear" in practice; spec says "Equipment". Accept both.
        "gear": "gear",
        "equipment": "gear",
        "rune": "rune",
        "battlefield": "battlefield",
        "legend": "legend",
    }
    out = mapping.get(raw)
    if out is None:
        raise ValueError(f"unrecognised classification.type {api_type!r}")
    return out


def derive_champion_key(name: str, normalised_type: str) -> str | None:
    """Legends and champion_units share a key derived from their name.

    'Draven, Showboat' -> 'draven'
    'Draven'           -> 'draven'
    """
    if normalised_type not in ("legend", "champion_unit"):
        return None
    head = name.split(",", 1)[0]
    return head.strip().lower() or None


def parse_dt(value: Any) -> Any:
    """Pass ISO-8601 strings through to psycopg; let bad values become NULL."""
    if not isinstance(value, str) or not value.strip():
        return None
    return value


def coerce_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def coerce_bool(value: Any) -> bool:
    return bool(value) if value is not None else False


def coerce_text_array(value: Any) -> list[str]:
    """API may return None, a string, or a list. Always return a list[str]."""
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value if v is not None]
    return [str(value)]


# ---------------------------------------------------------------------------
# Row builders
# ---------------------------------------------------------------------------

def build_set_row(s: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": s["id"],
        "set_id": s["set_id"],
        "name": s["name"],
        "card_count": coerce_int(s.get("card_count")),
        "tcgplayer_id": s.get("tcgplayer_id"),
        "cardmarket_id": coerce_text_array(s.get("cardmarket_id")),
        "published_on": parse_dt(s.get("published_on")),
        "data": Jsonb(s),
    }


def build_card_row(c: dict[str, Any]) -> dict[str, Any]:
    classification = c.get("classification") or {}
    attributes = c.get("attributes") or {}
    text = c.get("text") or {}
    set_obj = c.get("set") or {}
    media = c.get("media") or {}
    metadata = c.get("metadata") or {}

    norm_type = normalise_type(classification.get("type"), classification.get("supertype"))
    if norm_type not in ALLOWED_TYPES:
        raise ValueError(f"normalised type {norm_type!r} not in allowed set")

    domain = [d.strip().lower() for d in (classification.get("domain") or []) if d]

    name = c["name"]
    return {
        "id": c["id"],
        "riftbound_id": c["riftbound_id"],
        "tcgplayer_id": c.get("tcgplayer_id"),
        "collector_number": coerce_int(c.get("collector_number")),
        "name": name,
        "energy": coerce_int(attributes.get("energy")),
        "might": coerce_int(attributes.get("might")),
        "power": coerce_int(attributes.get("power")),
        "type": norm_type,
        "supertype": classification.get("supertype"),
        "rarity": classification.get("rarity"),
        "domain": domain,
        "text_rich": text.get("rich"),
        "text_plain": text.get("plain"),
        "text_flavour": text.get("flavour"),
        "set_id": set_obj.get("set_id"),
        "set_label": set_obj.get("label"),
        "image_url": media.get("image_url"),
        "artist": media.get("artist"),
        "accessibility_text": media.get("accessibility_text"),
        "tags": coerce_text_array(c.get("tags")),
        "orientation": c.get("orientation"),
        "clean_name": metadata.get("clean_name"),
        "updated_on": parse_dt(metadata.get("updated_on")),
        "alternate_art": coerce_bool(metadata.get("alternate_art")),
        "overnumbered": coerce_bool(metadata.get("overnumbered")),
        "signature": coerce_bool(metadata.get("signature")),
        "champion_key": derive_champion_key(name, norm_type),
        "data": Jsonb(c),
    }


# ---------------------------------------------------------------------------
# UPSERT helpers
# ---------------------------------------------------------------------------

def upsert(cur: psycopg.Cursor, table: str, rows: list[dict[str, Any]], pk: str) -> None:
    """Bulk upsert. All rows must have identical key sets."""
    if not rows:
        return
    cols = list(rows[0].keys())
    # synced_at is a server default — ON CONFLICT we want NOW() applied,
    # so we exclude it from inserts/updates and let DEFAULT / explicit NOW() handle it.
    placeholders = ", ".join(["%s"] * len(cols))
    col_list = ", ".join(f'"{c}"' for c in cols)
    update_set = ", ".join(
        f'"{c}" = EXCLUDED."{c}"' for c in cols if c != pk
    )
    sql = (
        f'INSERT INTO {table} ({col_list}, synced_at) '
        f'VALUES ({placeholders}, NOW()) '
        f'ON CONFLICT ("{pk}") DO UPDATE SET '
        f'{update_set}, synced_at = NOW()'
    )
    cur.executemany(sql, [tuple(r[c] for c in cols) for r in rows])


def upsert_index(cur: psycopg.Cursor, name: str, values: Any) -> None:
    cur.execute(
        'INSERT INTO card_indexes (name, "values", synced_at) '
        'VALUES (%s, %s, NOW()) '
        'ON CONFLICT (name) DO UPDATE SET '
        '"values" = EXCLUDED."values", synced_at = NOW()',
        (name, Jsonb(values)),
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    load_dotenv_local()
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        sys.stderr.write("DATABASE_URL is not set. Add it to .env.local.\n")
        return 1

    started = time.time()
    session = make_session()

    print("fetching /sets ...", flush=True)
    sets_raw = list(paginate(session, "/sets"))
    set_rows = [build_set_row(s) for s in sets_raw]

    print(f"fetching /cards (size={PAGE_SIZE}) ...", flush=True)
    cards_raw = list(paginate(session, "/cards"))

    print("normalising cards ...", flush=True)
    card_rows: list[dict[str, Any]] = []
    for c in cards_raw:
        try:
            card_rows.append(build_card_row(c))
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(
                f"failed to normalise card id={c.get('id')!r} "
                f"name={c.get('name')!r}: {e}\n"
            )
            return 1

    # Cards reference card_sets via FK. Make sure every card's set_id is present.
    known_set_ids = {r["set_id"] for r in set_rows}
    missing = sorted({r["set_id"] for r in card_rows} - known_set_ids)
    if missing:
        sys.stderr.write(
            f"cards reference set_ids not in /sets response: {missing}\n"
        )
        return 1

    print("fetching /index/* ...", flush=True)
    indexes: dict[str, Any] = {}
    for name in INDEX_NAMES:
        body = get_json(session, f"{BASE_URL}/index/{name}")
        indexes[name] = body.get("values", [])

    # All HTTP work is done. Now write everything in one transaction.
    print("writing to postgres ...", flush=True)
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            upsert(cur, "card_sets", set_rows, pk="id")
            upsert(cur, "cards", card_rows, pk="id")
            for name, values in indexes.items():
                upsert_index(cur, name, values)
        conn.commit()

    elapsed = time.time() - started
    print(
        f"done. sets={len(set_rows)} cards={len(card_rows)} "
        f"indexes={len(indexes)} in {elapsed:.1f}s",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
