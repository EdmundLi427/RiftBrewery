#!/usr/bin/env node
// Tiny migration runner.
//
// Reads numbered .sql files from ./migrations, tracks applied ones in a
// schema_migrations table, and runs any missing ones in filename order inside
// a transaction. Fails fast on any error.
//
// Usage: npm run migrate

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'migrations');

// Load .env.local so DATABASE_URL is populated when running outside of Next.
// Minimal parser: ignores comments, supports KEY=VALUE lines.
function loadDotEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      // strip optional surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

loadDotEnvLocal();

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add it to .env.local.');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const applied = new Set(
    (await sql`SELECT id FROM schema_migrations`).map((r) => r.id)
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // filesystem lexicographic sort matches our zero-padded numbering

  if (files.length === 0) {
    console.log('No migration files found in', migrationsDir);
    return;
  }

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file} (already applied)`);
      continue;
    }
    const sqlText = readFileSync(join(migrationsDir, file), 'utf8');
    console.log(`apply ${file}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(sqlText);
      await tx`INSERT INTO schema_migrations (id) VALUES (${file})`;
    });
    ran++;
  }

  console.log(`done. ${ran} migration(s) applied, ${files.length - ran} skipped.`);
}

main()
  .catch((err) => {
    console.error('migration failed:', err);
    process.exit(1);
  })
  .finally(() => sql.end());
