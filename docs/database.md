# RiftBrewery database

Single Postgres database, `riftbrewery`. Schema is managed by the plain-SQL
migration runner in `scripts/migrate.mjs`. Migration files live in
`migrations/NNNN_*.sql` and are applied in lexicographic order; the runner
records what has been applied in `schema_migrations`.

This doc reflects the schema as of migration `0005`.

## Extensions

- **`pgcrypto`** — `gen_random_uuid()` for `decks.id`.
- **`pg_trgm`** — trigram GIN index on `cards.name` for fuzzy name search.

Both enabled in `0002`.

## Tables at a glance

| Table             | Purpose                                            | Written by              |
|-------------------|----------------------------------------------------|-------------------------|
| `users`           | App accounts (email + bcrypt password)             | signup / login actions  |
| `card_sets`       | Riftbound set catalogue (OGN, SFD, UNL, ...)       | `sync_cards.py`         |
| `cards`           | Card catalogue, mirrors the Riftcodex API          | `sync_cards.py`         |
| `card_indexes`    | Cached `/index/*` lists for filter dropdowns       | `sync_cards.py`         |
| `decks`           | One row per user-created deck                      | deck server actions     |
| `deck_cards`      | Cards in each deck, by section + quantity          | deck server actions     |
| `schema_migrations` | Applied migration filenames                      | `scripts/migrate.mjs`   |

The card tables (`card_sets`, `cards`, `card_indexes`) are read-only from the
Next.js app — only the sync pipeline writes to them.

## `users`

```
users
├── id          SERIAL       PK
├── email       TEXT         NOT NULL UNIQUE
├── password    TEXT         NOT NULL          -- bcrypt hash
└── created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
```

Index: `users_email_idx (email)`.

`password` stores the bcrypt hash, not plaintext. Login flow lives in
`app/login/actions.ts`; signup in `app/create-account/actions.ts`. JWT
sessions are signed in `lib/jwt.ts` and stored in an httpOnly `token`
cookie.

## `card_sets`

```
card_sets
├── id            TEXT         PK              -- Riftcodex internal id
├── set_id        TEXT         NOT NULL UNIQUE -- "OGN", "SFD", "UNL", ...
├── name          TEXT         NOT NULL        -- "Origins", "Spiritforged"
├── card_count    INTEGER
├── tcgplayer_id  TEXT
├── cardmarket_id TEXT[]                        -- always normalised to array
├── published_on  TIMESTAMPTZ
├── data          JSONB        NOT NULL        -- raw API payload
└── synced_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
```

The `set_id` (e.g. `"OGN"`) is what `cards.set_id` references. `cards.set_id`
is `ON UPDATE CASCADE` so renames propagate without breaking decks.

## `cards`

The flat-renamed mirror of the Riftcodex `Card` schema. Every queryable API
field lives in its own typed column; the entire raw payload is also kept in
`data JSONB` as a safety net for schema drift.

```
cards
├── id                  TEXT          PK            -- Riftcodex id
├── riftbound_id        TEXT          NOT NULL      -- e.g. "ogn-011-298" (NOT unique: alt-art prints share these)
├── tcgplayer_id        TEXT
├── collector_number    INTEGER
├── name                TEXT          NOT NULL
│
├── energy              INTEGER                     -- mana cost (was attributes.energy)
├── might               INTEGER                     -- attributes.might
├── power               INTEGER                     -- attributes.power
│
├── type                TEXT          NOT NULL      -- normalised: see below
├── supertype           TEXT                        -- "Champion" | "Token" | NULL
├── rarity              TEXT
├── domain              TEXT[]        NOT NULL      -- lowercased: ['fury','calm']
│
├── text_rich           TEXT                        -- HTML
├── text_plain          TEXT
├── text_flavour        TEXT                        -- API field is "flavour" (UK)
│
├── set_id              TEXT          NOT NULL      -- FK → card_sets.set_id
├── set_label           TEXT          NOT NULL      -- denormalised for cheap reads
│
├── image_url           TEXT          NOT NULL
├── artist              TEXT
├── accessibility_text  TEXT
│
├── tags                TEXT[]        NOT NULL DEFAULT '{}'
├── orientation         TEXT                        -- 'portrait' | 'landscape'
├── clean_name          TEXT
├── updated_on          TIMESTAMPTZ
├── alternate_art       BOOLEAN       NOT NULL DEFAULT FALSE
├── overnumbered        BOOLEAN       NOT NULL DEFAULT FALSE
├── signature           BOOLEAN       NOT NULL DEFAULT FALSE
│
├── champion_key        TEXT                        -- legends + champion_units share this
├── data                JSONB         NOT NULL      -- full raw API payload
└── synced_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
```

Indexes:
- `cards_riftbound_id_idx (riftbound_id)`
- `cards_name_trgm_idx (name gin_trgm_ops)` — fuzzy name search.
- `cards_domain_gin_idx (domain)` — `domain && ARRAY[...]` queries.
- `cards_tags_gin_idx (tags)`
- `cards_type_idx (type)`
- `cards_set_id_idx (set_id)`
- `cards_champion_key_idx (champion_key) WHERE champion_key IS NOT NULL`

### `type` (closed set)

The pipeline normalises `classification.type` + `classification.supertype` into
one of these seven values. The validator and TS code rely on this exact set.

| Stored value     | API source                                                |
|------------------|------------------------------------------------------------|
| `legend`         | `type = "Legend"`                                          |
| `unit`           | `type = "Unit"`, no Champion supertype                     |
| `champion_unit`  | `type = "Unit"` AND `supertype = "Champion"`               |
| `spell`          | `type = "Spell"`                                           |
| `gear`           | `type = "Gear"` or `"Equipment"` (API uses both)           |
| `rune`           | `type = "Rune"`                                            |
| `battlefield`    | `type = "Battlefield"`                                     |

The pipeline aborts before any DB write if it sees a value outside that set,
so silent corruption from upstream changes is impossible.

### `domain` (lowercased)

Stored as a lowercase `TEXT[]`. The seven values currently in the catalogue
are `body`, `calm`, `chaos`, `colorless`, `fury`, `mind`, `order`. The UI
calls these "domains"; the validator's colour-identity logic uses these
strings directly.

### `champion_key` (heuristic)

Set on `legend` and `champion_unit` rows so a deck can confirm its champion
matches its legend. Derivation: `lower(trim(name.split(',')[0]))`. So
`"Draven, Showboat"` → `"draven"` and `"Draven"` → `"draven"`.

This is a heuristic — Riftcodex doesn't expose a stable champion id. If a
legend ever lands without the comma-prefix pattern, the match silently fails
for that pair. Worth checking after each sync that every legend has at least
one champion_unit with the same key.

## `card_indexes`

```
card_indexes
├── name       TEXT         PK     -- 'keywords' | 'card-names' | 'card-types' | ...
├── values     JSONB        NOT NULL  -- raw array
└── synced_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
```

Cached snapshots of the Riftcodex `/index/*` endpoints. Used to populate the
filter dropdowns in the browse pane without scanning `cards`. Refreshed every
sync.

Tracked names: `keywords`, `card-names`, `card-types`, `card-supertypes`,
`domains`, `rarities`, `artists`, `energy`, `might`, `power`, `tags`.

## `decks`

```
decks
├── id                UUID         PK DEFAULT gen_random_uuid()
├── user_id           INTEGER      NOT NULL → users(id) ON DELETE CASCADE
├── name              TEXT         NOT NULL
├── legend_card_id    TEXT         NULL → cards(id)        -- nullable: blank decks exist before legend pick
├── champion_card_id  TEXT         NULL → cards(id)
├── is_public         BOOLEAN      NOT NULL DEFAULT FALSE
├── share_slug        TEXT         UNIQUE                  -- only set when is_public=true
├── created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
└── updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()  -- auto-bumped by trigger
```

Indexes: `decks_user_id_idx`, `decks_legend_card_id_idx`,
`decks_champion_card_id_idx`, partial `decks_is_public_idx (is_public) WHERE
is_public`.

`updated_at` is bumped automatically by the `decks_set_updated_at` trigger
calling `set_updated_at()` on every `UPDATE`.

`legend_card_id` was originally `NOT NULL` but `0004` relaxed it so the
"create blank deck → pick legend in builder" flow works.

## `deck_cards`

Junction table. One row per (deck, card, section) triple, with a quantity.

```
deck_cards
├── deck_id   UUID     NOT NULL → decks(id) ON DELETE CASCADE
├── card_id   TEXT     NOT NULL → cards(id) ON DELETE RESTRICT
├── section   TEXT     NOT NULL    -- CHECK ∈ {champion, main, sideboard, battlefield, rune}
├── quantity  INTEGER  NOT NULL    -- CHECK >= 1
└── PK (deck_id, card_id, section)
```

Indexes: `deck_cards_deck_id_idx`, `deck_cards_card_id_idx`.

The composite PK means a card can appear once per section per deck. Two
copies of "Cleave" in main is `(deck, "ogn-004-...", "main", quantity=2)` —
not two rows.

The section CHECK was tightened in `0003` to add `champion` (1-card slot for
the chosen champion). The validator in `lib/rules.ts` enforces section sizes
and the copy-limit cap of 3 across `champion + main + sideboard`.

## `schema_migrations`

```
schema_migrations
├── id          TEXT         PK     -- migration filename
└── applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
```

Written by `scripts/migrate.mjs`. Adding a row here makes the runner skip the
corresponding file.

## Migrations applied to date

| File                                     | What it does                                                                  |
|------------------------------------------|-------------------------------------------------------------------------------|
| `0001_users.sql`                         | `users` table + email index.                                                  |
| `0002_cards_and_decks.sql`               | Extensions, placeholder `cards`, `decks`, `deck_cards`, `updated_at` trigger. |
| `0003_champion_and_domain.sql`           | `cards.champion_key`, `decks.champion_card_id`, adds `champion` to section CHECK. |
| `0004_card_full_schema.sql`              | Adds `card_sets` + `card_indexes`. Drops the placeholder `cards` and rebuilds it with the full Riftcodex shape (flat-renamed). Rebuilds FKs from `decks` and `deck_cards`. Relaxes `decks.legend_card_id` to NULLable. |
| `0005_riftbound_id_not_unique.sql`       | Drops UNIQUE on `cards.riftbound_id` (alt-art prints share these), keeps the index. |

## Common queries

Card pool for the browse pane (filter by name + type + cost + domain):

```sql
SELECT id, name, type, energy, domain, image_url, set_id
  FROM cards
 WHERE ($1::text IS NULL OR name ILIKE '%' || $1 || '%')
   AND ($2::text IS NULL OR type = $2)
   AND ($3::int  IS NULL OR energy = $3)
   AND ($4::text[] IS NULL OR (domain @> $4 AND domain <@ $4))
 ORDER BY name
 LIMIT 20 OFFSET $5;
```

Hydrate a deck for the validator (id index + entries):

```sql
SELECT dc.card_id, dc.section, dc.quantity
  FROM deck_cards dc
 WHERE dc.deck_id = $1;

SELECT c.id, c.name, c.type, c.domain
  FROM cards c
 WHERE c.id = ANY($1::text[]);
```

Legend → matching champion candidates:

```sql
SELECT id, name, image_url
  FROM cards
 WHERE type = 'champion_unit'
   AND champion_key = (SELECT champion_key FROM cards WHERE id = $1);
```

User's decks list:

```sql
SELECT d.id, d.name, d.legend_card_id, c.image_url AS legend_image, d.updated_at
  FROM decks d
  LEFT JOIN cards c ON c.id = d.legend_card_id
 WHERE d.user_id = $1
 ORDER BY d.updated_at DESC;
```

## Operations

### Apply migrations

```bash
npm run migrate
```

### Refresh card data

```bash
source .venv/bin/activate
npm run sync-cards
```

All-or-nothing transaction: if anything fails mid-run, the DB is unchanged.
See `scripts/README.md` for prereqs.

### Inspect

```bash
psql "$(grep '^DATABASE_URL=' .env.local | cut -d= -f2- | tr -d "'\"")"
```

Useful one-liners:

```sql
-- type distribution (sanity-check the closed set)
SELECT type, count(*) FROM cards GROUP BY type ORDER BY count(*) DESC;

-- legends without a matching champion_unit (heuristic warning)
SELECT l.id, l.name, l.champion_key
  FROM cards l
  LEFT JOIN cards c
    ON c.type = 'champion_unit' AND c.champion_key = l.champion_key
 WHERE l.type = 'legend' AND c.id IS NULL;

-- decks per user
SELECT u.email, count(d.id) AS decks
  FROM users u LEFT JOIN decks d ON d.user_id = u.id
 GROUP BY u.email
 ORDER BY decks DESC;
```
