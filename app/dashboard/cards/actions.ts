'use server';

import sql from '@/lib/db';
import type { CardRow } from '@/lib/cards';

export interface BrowseCardsParams {
  name?: string;
  type?: string;
  energy?: number;
  domain?: string[];
  page?: number;
  pageSize?: number;
}

const PAGE_SIZE_DEFAULT = 60;

/**
 * Browse cards with filters. Returns paginated results + total count.
 * Domain filter uses exact set match (both subset AND superset).
 */
export async function browseCards(params: BrowseCardsParams) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? PAGE_SIZE_DEFAULT;

  if (page < 1) {
    throw new Error('Page must be >= 1');
  }

  const offset = (page - 1) * pageSize;

  // Build WHERE clause with optional filters
  const whereConditions = [];

  if (params.name) {
    whereConditions.push(sql`name ILIKE ${'%' + params.name + '%'}`);
  }

  if (params.type) {
    whereConditions.push(sql`type = ${params.type}`);
  }

  if (params.energy !== undefined) {
    whereConditions.push(sql`energy = ${params.energy}`);
  }

  if (params.domain && params.domain.length > 0) {
    // Domain exact match: card's domain set equals selected set
    // Implemented as @> AND <@ (subset both ways = equality)
    whereConditions.push(
      sql`domain @> ${params.domain} AND domain <@ ${params.domain}`
    );
  }

  // Combine conditions
  let whereClause = sql`WHERE TRUE`;
  for (const condition of whereConditions) {
    whereClause = sql`${whereClause} AND ${condition}`;
  }

  const rows = await sql<CardRow[]>`
    SELECT id, riftbound_id, name, type, supertype, rarity, domain,
           energy, might, power, text_plain, text_flavour,
           set_id, set_label, image_url, tags, champion_key
      FROM cards
      ${whereClause}
     ORDER BY name
     LIMIT ${pageSize} OFFSET ${offset}
  `;

  const [countRow] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM cards ${whereClause}
  `;

  const total = countRow?.count || 0;
  const totalPages = Math.ceil(total / pageSize);

  return {
    cards: rows,
    page,
    pageSize,
    total,
    totalPages,
  };
}

/**
 * Get a single card by ID.
 */
export async function getCard(cardId: string): Promise<CardRow | null> {
  const rows = await sql<CardRow[]>`
    SELECT id, riftbound_id, name, type, supertype, rarity, domain,
           energy, might, power, text_plain, text_flavour,
           set_id, set_label, image_url, tags, champion_key
      FROM cards
     WHERE id = ${cardId}
     LIMIT 1
  `;
  return rows[0] ?? null;
}
