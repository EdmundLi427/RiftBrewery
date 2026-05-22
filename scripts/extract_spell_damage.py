#!/usr/bin/env python3
"""
One-off extraction pass: Haiku extracts face-value spell damage from card text.

Resumable via spell_damage_synced flag. Damage is permanently cached — card data
never changes. Built to later also extract power/recycle cost without re-architecting.

Usage:
  python scripts/extract_spell_damage.py [--limit 10]  (for testing)
  python scripts/extract_spell_damage.py                (full pass, resumable)
"""

import os
import sys
import json
import argparse
from typing import Optional
import psycopg
import anthropic

def get_db_connection():
    """Connect to the Riftbound DB using DATABASE_URL."""
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        raise ValueError('DATABASE_URL not set')
    return psycopg.connect(db_url)

def get_unsynced_spells(limit: Optional[int] = None):
    """Fetch spells not yet synced for spell damage extraction."""
    conn = get_db_connection()
    cur = conn.cursor()

    query = '''
    SELECT id, name, type, text_plain
    FROM cards
    WHERE type = 'spell' AND spell_damage_synced = FALSE
    ORDER BY synced_at DESC
    LIMIT %s
    '''

    cur.execute(query, (limit,) if limit else (99999,))
    rows = cur.fetchall()
    cur.close()
    conn.close()

    return [{'id': r[0], 'name': r[1], 'type': r[2], 'text_plain': r[3]} for r in rows]

def extract_spell_damage(card_text: str) -> dict:
    """Call Haiku to extract spell damage from card text."""
    client = anthropic.Anthropic()

    prompt = f"""Extract the face-value spell damage from this card text. Return JSON only.

Card text:
{card_text}

Return exactly this JSON (no markdown, no extra text):
{{"damage": <number or null>, "targets": <"single" or "multi" or null>}}

- damage: the face-value damage number, or null if not a damage spell
- targets: "single" if it hits one target, "multi" if multiple, null if no damage
- Ignore conditional or scaling damage; use only the stated base number."""

    response = client.messages.create(
        model='claude-haiku-4-5-20241001',
        max_tokens=100,
        messages=[{'role': 'user', 'content': prompt}],
    )

    result_text = response.content[0].text.strip()
    return json.loads(result_text)

def update_card_damage(card_id: str, damage: Optional[int], targets: Optional[str]):
    """Update the card row with extracted damage."""
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        '''
        UPDATE cards
        SET spell_damage = %s, spell_damage_targets = %s, spell_damage_synced = TRUE
        WHERE id = %s
        ''',
        (damage, targets, card_id)
    )

    conn.commit()
    cur.close()
    conn.close()

def main():
    parser = argparse.ArgumentParser(description='Extract spell damage from card text.')
    parser.add_argument('--limit', type=int, default=None, help='Limit number of cards to process (for testing)')
    args = parser.parse_args()

    spells = get_unsynced_spells(args.limit)

    if not spells:
        print('No unsynced spells found.')
        return

    print(f'Processing {len(spells)} spells...')

    for i, spell in enumerate(spells, 1):
        try:
            result = extract_spell_damage(spell['text_plain'])
            damage = result.get('damage')
            targets = result.get('targets')

            update_card_damage(spell['id'], damage, targets)
            print(f'[{i}/{len(spells)}] {spell["name"]}: damage={damage}, targets={targets}')
        except Exception as e:
            print(f'[{i}/{len(spells)}] {spell["name"]}: ERROR — {e}', file=sys.stderr)

    print(f'Done. Synced {len(spells)} spells.')

if __name__ == '__main__':
    main()
