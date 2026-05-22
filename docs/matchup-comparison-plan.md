# Matchup Comparison — Feature Plan

A new tab under the dashboard that lets a logged-in user pick two of their own
decks, see a side-by-side statistical comparison, run a three-step AI analysis
(per-deck gameplan → interaction → verdict), and end on a "who wins" summary
split.

This document is the design contract. Every decision below was walked through
and confirmed; sections that say "v1" describe the scope deliberately chosen for
the first release, with later extensions noted where relevant.

---

## 0. Confirmed decisions (summary)

| Area | Decision |
|---|---|
| Scope | v1 is **personal-only** — a user compares two of their *own* decks. Cross-user / public-deck comparison is a later version. |
| Deck gating | **Hard legal-deck gate.** Both decks must be valid (legal) per `validateDeck()`. An illegal deck cannot be compared — no warn-and-allow. |
| Sharing | **Matchups are private in v1.** No public matchup view, no share slug. Revisited later alongside cross-user comparison. |
| Stats scope | Computed from **main deck + champion only**. Sideboard, battlefields, and runes are excluded from the stat axes. |
| Stats axes | Energy curve (avg + median + histogram); might (avg + median, units only); **median might by cost bucket**; type / domain / tag / keyword breakdowns; spell-damage stats. |
| Cost buckets | **Low ≤ 2 energy** (1-drops included — you channel 2 runes/turn), **mid 3–5**, **top end 6+**. |
| Spell damage | New `cards` columns, backfilled by a **one-off Haiku extraction pass**. Damage counted at **face value**. Permanently cached — card data never changes. |
| Power-cost footprint | **Cut from v1.** Our card data has a `power` *attribute* but no structured *power cost*. The extraction script is built so a power/recycle-cost pass can be added later without re-architecting. |
| AI calls | **Three calls.** Haiku for the two gameplan calls; Sonnet for interaction and verdict. |
| Caching | **Layer-1 per-deck gameplan caching** by decklist content-hash (reuse closest-matching deck). **Full-matchup caching** by deck-pair hash — repeat comparisons re-run zero calls. |
| Cost controls | **No usage cap in v1.** Double-submit guard on the Compare button; full-matchup cache prevents paying twice for the identical pairing. |
| Archetypes | Four primary: **Aggro / fast-conquer, Midrange, Control / hold, Combo** (combo rare, exception only). Plus an independent **board shape** tag: wide or tall. |
| Verdict | A **split** — single integer 0–100 for Deck A favorability, rounded to nearest 5, Deck B = 100 − A. 2–3 sentence prose reasoning. Always commits to a number; **no uncertainty signal**. |
| Verdict role | The verdict call is a pure **summarizer** of calls 1 and 2 — it never re-derives the analysis. |
| Expert prompt | One shared **Riftbound expert system prompt**, stored as a single editable constant, used by all three calls. |
| Build order | (1) Spell-damage backfill → (2) matchups table → (3) stats engine → (4) UI + stats view, **ship v0.5 stats-only** → (5) AI layer, ship v1.0 → (6) verification. |
| Persistence | Matchups are **persisted from v0.5** — the matchups table exists before the interim release, with AI columns nullable until v1.0 fills them. |

---

## 1. Where it slots into the app

**List route:** `app/dashboard/matchups/page.tsx` — server component, lists the
user's prior matchups and an entry point to a new one.
**Builder route:** `app/dashboard/matchups/new/page.tsx` — the two-deck picker.
**Result route:** `app/dashboard/matchups/[id]/page.tsx` — the comparison view,
persisted so the user can revisit it.

**Nav tab:** add one entry to `app/dashboard/nav.tsx` `LINKS`:
`{ href: '/dashboard/matchups', label: 'Matchups' }`

Tab order is **`My Decks → Cards → Public Decks → Matchups → Account`** — Matchups
sits immediately before Account, per the confirmed placement.

The dashboard layout already injects the nav and the auth gate, so the new pages
get those for free.

---

## 2. What we already have (existing data model)

Relevant tables (see `docs/database.md`):

**`decks`** — `id (UUID) · user_id · name · legend_card_id · champion_card_id ·
is_public · share_slug · created_at · updated_at`
**`deck_cards`** — `(deck_id, card_id, section, quantity)` where
`section ∈ {champion, main, sideboard, battlefield, rune}`
**`cards`** — the rich table. The attributes relevant to comparison:

| Column | Use in comparison |
|---|---|
| `type` | unit / champion_unit / spell / gear counts |
| `supertype` | distinguishes champion_units from regular units |
| `energy` | energy-cost stats (average, median, curve histogram) |
| `might` | might stats (average, median; units only) |
| `power` | **a card attribute, NOT a play cost** — see §3.1. Not used as a cost axis in v1. |
| `domain` | colour identity → matchup domain-pair label |
| `tags` | faction / tribal flags — feeds archetype detection |
| `text_plain` | plain card text — feeds keyword frequency and the spell-damage extraction |
| `name`, `image_url` | display |

**Existing helpers we reuse:**

- `getDeck(deckId)` in `app/dashboard/actions.ts` — returns the deck plus a
  hydrated card index. The matchup feature calls it twice, once per deck.
- `validateDeck()` in `lib/rules.ts` — called on both decks before anything else.
  An illegal deck hard-blocks the comparison (see §0, deck gating).
- `set_updated_at()` trigger function defined in `migrations/0002_cards_and_decks.sql`
  — reused by the new `matchups` table.

---

## 3. Schema changes

### 3.1 Spell-damage enrichment on `cards`

The stats panel reports spell-damage numbers. Damage is not a structured field
in the Riftcodex API — it is only reliably stated in the card *text*. So we
enrich `cards` with a one-off extraction pass.

`migrations/0006_card_spell_damage.sql`:

```sql
ALTER TABLE cards ADD COLUMN spell_damage         INTEGER;   -- face-value damage, NULL if none / not a damage spell
ALTER TABLE cards ADD COLUMN spell_damage_targets TEXT;      -- 'single' | 'multi' | NULL
ALTER TABLE cards ADD COLUMN spell_damage_synced  BOOLEAN NOT NULL DEFAULT FALSE;
```

A one-off script — `scripts/extract_spell_damage.py` — runs Haiku over every
spell in the catalogue, extracts the **face-value** damage and whether it hits a
single target or multiple, and writes the three columns. `spell_damage_synced`
marks rows already processed so the pass is resumable and never re-runs a card.

This is permanently cached: **card data never changes**, so the pass runs once
and the results stand. The script is structured so a *second* extraction —
power / recycle cost — can be bolted on later (see §3.3) without rewriting it.

> Note on `cards.power`: the column exists and is populated, but the sync
> pipeline pulls it from the API's `attributes` object alongside `energy` and
> `might` — it is the card's **power attribute**, not a record of "this card
> costs N power to play." Riftbound's *power cost* (paid by recycling runes) is
> not in our structured data. See §3.3.

### 3.2 The `matchups` table

`migrations/0007_matchups.sql`. **Designed for the full v1.0 shape from day one**
— the AI-output and cache columns exist immediately but are nullable, so a v0.5
stats-only matchup simply leaves them NULL and no second migration is needed
when the AI layer lands.

```sql
CREATE TABLE matchups (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_a_id       UUID         NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  deck_b_id       UUID         NOT NULL REFERENCES decks(id) ON DELETE CASCADE,

  -- Content hashes for caching. deck_*_hash identify each deck's card list;
  -- pair_hash is the full-matchup cache key (see §6.3).
  deck_a_hash     TEXT         NOT NULL,
  deck_b_hash     TEXT         NOT NULL,
  pair_hash       TEXT         NOT NULL,

  -- Snapshot of computed stats (see §5). Present from v0.5.
  stats           JSONB        NOT NULL,

  -- AI output. NULL in v0.5; populated by the v1.0 AI layer (see §6).
  gameplan_a      JSONB,       -- {archetype, board_shape, summary, win_conditions[], key_cards[], weaknesses[]}
  gameplan_b      JSONB,
  interaction     JSONB,       -- {summary, deck_a_advantages[], deck_b_advantages[]}
  verdict         JSONB,       -- {score_a: 0..100, reasoning}

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CHECK (deck_a_id <> deck_b_id)
);

CREATE INDEX matchups_user_id_idx   ON matchups(user_id);
CREATE INDEX matchups_pair_hash_idx ON matchups(pair_hash);

CREATE TRIGGER matchups_set_updated_at
  BEFORE UPDATE ON matchups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

No changes to `decks` or `deck_cards`. The only `cards` change is the additive
spell-damage columns in §3.1.

### 3.3 Deferred: power / recycle cost

Riftbound's resource model has two costs — *energy* (renewable, from tapping
runes) and *power* (from recycling runes, a permanent resource loss). A
"power-cost footprint" stat would be a strong archetype signal (it is literally
the greedy / fast axis), but our data has no structured power cost. **Cut from
v1.** When wanted later, extend `scripts/extract_spell_damage.py` to also pull
each card's power / recycle cost into a new column — one more Haiku pass over the
same text, permanently cached. The expert prompt (a single editable constant)
already references "power-cost footprint" as a forward-looking signal; nothing
needs re-architecting to add it.

---

## 4. Workflow — UI states

The user-facing flow is **Select Decks → Compare Stats → AI Analysis → Summary**.

**v0.5 (stats-only release)** ships the first two stages as a clean two-step
flow. It does *not* stub dead "AI Analysis" / "Summary" tabs — the UI shell is
built to *grow* into the four-stage flow when v1.0 lands.

**v1.0** adds the AI Analysis and Summary stages.

```
/dashboard/matchups/new
   [ Deck A picker ]   vs.   [ Deck B picker ]
   (legend image, card count, domain badges per side)
   [ Compare ]   ← disabled while a request is in flight (double-submit guard)
        │
        ▼
/dashboard/matchups/[id]
   ── Stats Comparison ──            (v0.5+, computed, no AI)
       side-by-side energy curve, median might by cost bucket,
       type / domain / tag / keyword breakdowns, spell-damage stats

   ── Gameplans ──                   (v1.0, AI call 1 ×2)
       Deck A: archetype + board shape + summary + key cards
       Deck B: archetype + board shape + summary + key cards

   ── Interaction ──                 (v1.0, AI call 2)
       how each deck's race-to-8 plan beats or loses to the other

   ── Summary / Verdict ──           (v1.0, AI call 3)
       Deck A 65 / Deck B 35 · 2–3 sentence reasoning
```

The Compare button disables while a request is in flight. If the exact deck
pair (by `pair_hash`) was already compared, the stored matchup is served
instead of re-running anything (see §6.3).

---

## 5. The stats comparison — exact numbers to compute

Deterministic, no AI. A pure module — `lib/matchup/stats.ts` — over the two
decks' card lists, fully unit-testable. This is the entire substance of the
**v0.5 release**.

Computed per deck from its **`champion + main` cards only** (sideboard,
battlefields, and runes are excluded from every axis below).

### Per-deck stats

**Energy**
- Average energy (main + champion, weighted by quantity, ignoring NULL energy)
- Median energy
- Energy-curve histogram: `{0,1,2,3,4,5,6,'7+'}` for the mini-chart

**Might** (units + champion_units only)
- Average might
- Median might
- **Median might by cost bucket** — the headline axis:
  - low cost: cards with `energy ≤ 2` (1-drops included)
  - mid cost: `energy 3–5`
  - top end: `energy ≥ 6`

**Composition**
- Count by `type`: `unit`, `champion_unit`, `spell`, `gear`
- Domain breakdown (pip count, weighted by quantity)
- Top tags by frequency (faction / tribal signal)
- Top keywords — string-matched from `text_plain` against the canonical
  keyword list in `card_indexes` (`name='keywords'`)

**Spell damage** (from the §3.1 enrichment columns)
- Total burn (sum of `spell_damage` across the deck, weighted by quantity)
- Burn count (number of damage spells)
- Average burn per damage spell
- Single-target vs multi-target split (from `spell_damage_targets`)

### Comparison-level stats

- Domain overlap between the two legends
- Deltas: energy, median might, spell density
- Champion matchup label: `"{champion_a} vs {champion_b}"`

The whole blob is snapshotted into `matchups.stats` so the comparison is stable
even if a deck is edited afterwards.

---

## 6. The AI analysis — three calls

Added in **v1.0**. Each step's structured output is the next step's input, so
the model never holds the whole problem at once and the verdict cannot contradict
the analysis the user just read.

Add `@anthropic-ai/sdk` and an `ANTHROPIC_API_KEY` env var.

### 6.0 The shared expert prompt

All three calls send **one shared Riftbound expert system prompt**, stored as a
single exported constant (`lib/matchup/prompts.ts`, e.g.
`RIFTBOUND_EXPERT_PROMPT`). No call inlines prompt text. Per-call task
instructions ("produce a gameplan", "compare these two", "output the split")
are separate constants layered on top of the shared persona. Editing Riftbound
mechanics wording is a one-file change.

The expert prompt covers: the persona; the resource model (runes capped at 12, 2
channelled per turn, tap → energy / recycle → power, power as a permanent
resource loss); the win condition (race to 8 points across two battlefields,
conquer vs hold, the restricted 8th point); and the archetype taxonomy. The
current text is maintained in `lib/matchup/prompts.ts` and is the canonical copy.

### 6.1 Call 1 — Per-deck gameplan (two calls — **Haiku**)

One call per deck. Input: a compact card list plus the computed stats from §5.
Output (structured JSON):

```ts
type Gameplan = {
  archetype: 'aggro' | 'midrange' | 'control' | 'combo';
  board_shape: 'wide' | 'tall';
  summary: string;            // grounded in the race-to-8 framing
  win_conditions: string[];
  key_cards: Array<{ name: string; role: string }>;
  weaknesses: string[];       // feeds call 2
};
```

`combo` is rare — the prompt instructs the model to treat it as the exception
and otherwise classify by the deck's normal race-to-8 plan. `board_shape` is
independent of archetype.

### 6.2 Call 2 — Interaction analysis (one call — **Sonnet**)

Input: both gameplans + both stat blobs + the comparison deltas. Output:

```ts
type Interaction = {
  summary: string;
  deck_a_advantages: string[];
  deck_b_advantages: string[];
};
```

### 6.3 Call 3 — Verdict / Summary (one call — **Sonnet**)

A pure **summarizer** of calls 1 and 2 — it does not re-analyze. Output:

```ts
type Verdict = {
  score_a: number;   // integer 0..100, rounded to nearest 5; score_b = 100 - score_a
  reasoning: string; // 2–3 sentences, prose, race-to-8 framing
};
```

The Summary screen leads with the split (`Deck A 65 / Deck B 35`, or
`Even matchup, 50/50`) and the reasoning paragraph beneath. The model **always
commits to a number** — there is no uncertainty signal.

### 6.4 Caching

- **Layer-1, per-deck:** each deck's gameplan (call 1) is cached by a
  content-hash of its card list (`deck_a_hash` / `deck_b_hash`). The closest
  matching deck's cached gameplan is reused where applicable.
- **Full-matchup:** the whole result is cached by `pair_hash` (a hash of the two
  deck hashes). A repeat comparison of the *exact* same pairing re-runs **zero**
  AI calls — the persisted `matchups` row *is* the cache. Editing either deck
  changes its hash, hence `pair_hash`, producing a correct fresh comparison, so
  the cache is never stale.

This caches all three calls, including the two Sonnet calls — they are no longer
paid for on repeat clicks.

### 6.5 Cost controls

**No usage cap in v1.** The mitigations are: the §6.4 caching (don't pay twice
for the identical thing), the double-submit guard on the Compare button (don't
pay three times for one click), and the Haiku-for-gameplans / Sonnet-for-the-rest
model split. A per-user or global cap can be added later if usage warrants it.

---

## 7. End-to-end data flow

```
User clicks "Compare"  (button disables — double-submit guard)
    │
    ▼
Server Action: createMatchup(deckAId, deckBId)
    ├── auth check (getSessionUserId)
    ├── ownership check — both decks belong to the user (v1: personal-only)
    ├── validateDeck() on both — illegal deck hard-blocks here
    ├── compute deck_a_hash, deck_b_hash, pair_hash
    ├── if a matchup with this pair_hash exists → return it (full-matchup cache)
    ├── load both decks via getDeck() ×2
    ├── compute MatchupStats        (lib/matchup/stats.ts)
    ├── INSERT matchups row with stats   (AI columns NULL)
    └── redirect to /dashboard/matchups/[id]

Result page
    ├── renders the Stats panel immediately
    └── v1.0 only:
          ├── call 1 ×2 (Haiku gameplans) — Layer-1 cache checked per deck
          │     → UPDATE gameplan_a / gameplan_b
          ├── call 2 (Sonnet interaction)
          │     → UPDATE interaction
          └── call 3 (Sonnet verdict)
                → UPDATE verdict
```

In v0.5 the flow stops after the stats panel — the row is persisted with AI
columns NULL.

---

## 8. Files to create / modify

**New files**

- `migrations/0006_card_spell_damage.sql` — spell-damage columns on `cards`
- `migrations/0007_matchups.sql` — the `matchups` table
- `scripts/extract_spell_damage.py` — one-off Haiku backfill (resumable;
  built to later also extract power / recycle cost)
- `lib/matchup/stats.ts` — pure stat computation (+ `tests/matchup-stats.test.ts`)
- `lib/matchup/prompts.ts` — the shared expert prompt + per-call task prompts
- `lib/matchup/ai.ts` — `runGameplan()`, `runInteraction()`, `runVerdict()`
- `lib/matchup/hash.ts` — deck-list and pair content-hashing
- `app/dashboard/matchups/page.tsx` — list of past matchups
- `app/dashboard/matchups/new/page.tsx` — two-deck picker
- `app/dashboard/matchups/[id]/page.tsx` — result view (server)
- `app/dashboard/matchups/[id]/matchup-client.tsx` — client component
- `app/dashboard/matchups/[id]/actions.ts` — `createMatchup`, AI step actions

**Modified files**

- `app/dashboard/nav.tsx` — add the Matchups link (before Account)
- `package.json` — add `@anthropic-ai/sdk`
- `.env.local` — add `ANTHROPIC_API_KEY` (not committed)
- `docs/database.md` — document the `cards` spell-damage columns and the
  `matchups` table once the migrations apply

> Next.js note: this project runs a non-standard Next.js version with breaking
> changes (see `AGENTS.md`). Read `node_modules/next/dist/docs/` before writing
> route / server-action code.

---

## 9. Build order

Each step leaves the app in a working state; the cheap, safe, testable parts
come before the expensive AI part.

1. **Spell-damage backfill** — `0006_card_spell_damage.sql`,
   `scripts/extract_spell_damage.py`, run and verify. Independent card-data
   enrichment, no UI, no matchup code.
2. **Matchups table** — `0007_matchups.sql`, designed for the full v1.0 shape
   with AI columns nullable.
3. **Stats engine** — `lib/matchup/stats.ts` + unit tests. Pure functions, no AI.
4. **UI shell + stats view, with persistence → ship v0.5.** Matchups nav entry,
   a landing page listing saved comparisons, the two-deck picker, the polished
   statistical comparison. Matchups are saved (AI columns NULL). Two-step flow,
   built to grow into four. This is a real interim release.
5. **AI layer → v1.0.** `@anthropic-ai/sdk`, the three calls, the expert prompt,
   Layer-1 and full-matchup caching. Populates the previously-NULL columns; adds
   the AI Analysis and Summary stages to the flow.
6. **Verification pass.** Run real deck pairs end to end; hand-check the stats
   math; confirm caching prevents re-runs; sanity-check that verdicts read
   sensibly.

---

## 10. Risk notes

- **Hard legal gate blocks mid-build decks.** Confirmed and intentional — a
  matchup score is meaningless on an illegal deck. The picker should clearly
  mark which of the user's decks are legal so the gate is not a surprise.
- **Keyword extraction is heuristic.** String-matching `text_plain` against the
  canonical keyword list risks false positives; anchor on word boundaries and
  Riftbound's capitalised-keyword convention. A `cards.keywords TEXT[]` column
  populated by the sync pipeline is the more robust later fix.
- **AI hallucinations on card names.** When a call returns `key_cards`, discard
  any name not present in the deck input, log it, and proceed.
- **Spell-damage extraction accuracy.** Haiku must read face-value damage only,
  not conditional or scaling damage. Spot-check the backfill output before
  trusting the spell-damage stats.
- **Expert-prompt correctness.** The whole AI feature leans on the Riftbound
  expert prompt being mechanically accurate. It is kept as a single reviewable
  constant in `lib/matchup/prompts.ts` for exactly this reason.
