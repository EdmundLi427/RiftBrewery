# Riftcodex API — what's actually true

The published spec at `https://api.riftcodex.com` and the doc we were originally
handed don't match the live API in a few places. This file captures the real
behaviour we discovered while building `scripts/sync_cards.py`. Read this
before changing the pipeline or writing anything else that calls the API.

Base URL: `https://api.riftcodex.com`. No auth. Cloudflare in front.

## Cloudflare blocks plain Node fetch

Plain `fetch()` from Node returns 403 with an HTML challenge body. The fix
isn't custom headers — it's TLS fingerprinting. We use Python's `curl_cffi`
with `impersonate="chrome120"`, which sends a real Chrome TLS handshake.

`chrome124` and `safari17_0` also work. `chrome131` is not supported by the
`curl_cffi` version pinned in `scripts/requirements.txt`. If Cloudflare ever
escalates and `chrome120` stops working, bump to a newer impersonate target
in `sync_cards.py`'s `IMPERSONATE` constant.

Don't waste time on Playwright. Don't waste time tweaking `User-Agent` —
that alone won't get past the challenge.

## Pagination shape (the spec is wrong)

The spec says paginated endpoints return:

```json
{ "data": [...], "pagination": { "page": 1, "size": 50, "total": 532, "pages": 6 } }
```

The actual response is:

```json
{ "items": [...], "total": 532, "page": 1, "size": 50, "pages": 6 }
```

Items live under `items`, not `data`. Pagination metadata is flat at the top
level, not nested under `pagination`. Both `/cards` and `/sets` use this
shape. `paginate()` in the sync script reads `body["items"]` and stops when
`page >= body["pages"]`.

## `classification.type` values

The spec lists `Unit | Spell | Equipment | Rune | Battlefield | Legend`. The
API returns **`Gear`** in practice, not `Equipment`. The normaliser in
`sync_cards.py` accepts both; new code should expect `Gear`.

The full set of stored types (post-normalisation) is closed:
`legend`, `unit`, `champion_unit`, `spell`, `gear`, `rune`, `battlefield`.
The pipeline aborts before any DB write if the API returns a type outside
that set.

`champion_unit` is derived: `classification.type == "Unit"` AND
`classification.supertype == "Champion"`. There is no separate `Champion`
type from the API.

## Domains

The `/index/domains` endpoint returns:

```
["Body", "Calm", "Chaos", "Colorless", "Fury", "Mind", "Order"]
```

Seven values, not the six the spec implies. **Colorless** is a real domain
that appears on actual cards (e.g. some neutrals). The validator's
colour-identity check currently treats `colorless` like any other colour,
which means a colorless card can't legally go in any 2-colour deck under our
current rules. Worth a follow-up if real Riftbound rules say otherwise.

Stored lowercase. The pipeline does the lowercasing once, at ingest.

## Sets

Currently 7 sets in the catalogue (we synced 1,064 cards across them). The
spec mentioned three (OGN, SFD, OPP). Real list includes at least UNL
(Unleashed). Don't hard-code set IDs anywhere — read from `card_sets`.

`set.set_id` on a card row points at `card_sets.set_id` (a `TEXT` like
`"OGN"`), not the Riftcodex internal id.

`published_on` comes back without a timezone (`"2026-02-13T00:00:00"`).
Postgres `TIMESTAMPTZ` accepts it as UTC.

`cardmarket_id` may be a string OR a list of strings. The pipeline always
normalises to a `TEXT[]`.

## `riftbound_id` is not unique

`riftbound_id` looks like `"ogn-011-298"` and is great for human-friendly
lookups. It is **not unique** — alternate-art prints (`ogn-060a-219`) and
some reprints share the same id, or near-identical ids that collide once
inserted. The real PK is `cards.id` (Riftcodex internal id).

Migration `0005_riftbound_id_not_unique.sql` dropped the UNIQUE constraint
that `0004` originally added. Don't reintroduce it.

## Card field shape (sample)

A real card row, post-fix:

```json
{
  "id": "69bc5bebd308c64675ca8978",
  "name": "Vilemaw (Alternate Art)",
  "riftbound_id": "unl-060a-219",
  "tcgplayer_id": "684492",
  "collector_number": 60,
  "attributes": { "energy": 8, "might": 8, "power": 2 },
  "classification": {
    "type": "Unit",
    "supertype": null,
    "rarity": "Showcase",
    "domain": ["Calm"]
  },
  "text": {
    "rich": "<p>...</p>",
    "plain": "...",
    "flavour": "Its lair lies beyond a twisted treeline."
  },
  "set": { "set_id": "UNL", "label": "Unleashed" },
  "media": {
    "image_url": "https://cmsassets.rgpub.io/.../...png",
    "artist": "Envar Studio",
    "accessibility_text": "..."
  },
  "tags": ["Shadow Isles", "Spider"],
  "orientation": "portrait",
  "metadata": {
    "clean_name": "Vilemaw Alternate Art",
    "updated_on": "2026-03-19T20:26:19.376852+00:00",
    "alternate_art": true,
    "overnumbered": false,
    "signature": false
  }
}
```

The British spelling on `text.flavour` is real. Stored as `text_flavour` in
our schema.

## Index endpoints

Each `/index/*` returns:

```json
{ "type": "domains", "total": 7, "values": ["Body", "Calm", ...] }
```

We pull all 11 (`keywords`, `card-names`, `card-types`, `card-supertypes`,
`domains`, `rarities`, `artists`, `energy`, `might`, `power`, `tags`) and
cache the `values` array in `card_indexes`. They're snapshots — refreshed
every sync — and exist so the browse-pane filter dropdowns don't have to
scan `cards`.

## When the spec and reality disagree

Reality wins. If you find a new mismatch:

1. Add a probe to `scripts/probe.py` (or write a fresh one) that prints raw
   responses, not assumptions.
2. Update `sync_cards.py` to handle the new shape.
3. If the new behaviour is permanent, update this file. If it's a transient
   API bug, log it but don't enshrine the workaround.

## Endpoints we don't use

The spec mentions `/cards/search` (full-text), `/cards/name`, `/cards/{id}`,
`/cards/riftbound/{id}`, `/cards/tcgplayer/{tcgplayer_id}`. We don't call
any of these — the full catalogue fits in one paginated `/cards` pull. If
you need them later, treat the spec as a starting hint and probe the actual
shape first.
