// Apply SQL migrations under backend/migrations/*.sql against DATABASE_URL.
// Usage: DATABASE_URL=postgres://... npx ts-node scripts/migrate-postgres.ts
//
// Tracks applied versions in a `schema_migrations` table. Each migration
// file contains its own BEGIN/COMMIT; the runner records the version after
// the file's transaction commits.

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { sql } from 'kysely';
import { getKyselyDb, closeKyselyDb } from '../lib/repositories/postgres/db';

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

async function main() {
  const db = getKyselyDb();

  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  const appliedResult = await sql<{ version: string }>`
    SELECT version FROM schema_migrations
  `.execute(db);
  const applied = new Set(appliedResult.rows.map((r) => r.version));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) {
      console.log(`skip  ${version} (already applied)`);
      continue;
    }

    const fullSql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`apply ${version}...`);

    await sql.raw(fullSql).execute(db);
    await sql`
      INSERT INTO schema_migrations (version) VALUES (${version})
      ON CONFLICT (version) DO NOTHING
    `.execute(db);

    ran += 1;
    console.log(`ok    ${version}`);
  }

  console.log(
    `\nDone. ${ran} migration(s) applied, ${files.length - ran} already up to date.`,
  );
  await closeKyselyDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeKyselyDb();
  process.exit(1);
});
