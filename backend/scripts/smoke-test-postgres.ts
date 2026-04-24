// Quick end-to-end sanity check for the postgres driver. Creates a player,
// reads it back, deletes it, and closes the connection. Safe to re-run —
// always cleans up what it creates. Requires DATABASE_URL and a migrated DB.
//
// Usage: DATABASE_URL=... npx ts-node scripts/smoke-test-postgres.ts

process.env.DB_DRIVER = 'postgres';

import '../lib/repositories';
import { getRepositories } from '../lib/repositories';
import { closeKyselyDb } from '../lib/repositories/postgres/db';

async function main() {
  const repos = getRepositories();

  console.log('1. creating player...');
  const created = await repos.roster.players.create({
    name: 'Smoke Test Player',
    currentWrestler: 'Smoke Test Wrestler',
  });
  console.log(`   → ${created.playerId} (${created.name})`);

  console.log('2. reading it back...');
  const fetched = await repos.roster.players.findById(created.playerId);
  if (!fetched) throw new Error('player not found after create');
  console.log(`   → name=${fetched.name}, wins=${fetched.wins}`);

  console.log('3. updating...');
  const updated = await repos.roster.players.update(created.playerId, {
    psnId: 'smoke-test-psn',
  });
  console.log(`   → psnId=${updated.psnId}`);

  console.log('4. incrementing record via UoW...');
  await repos.runInTransaction(async (tx) => {
    tx.incrementPlayerRecord(created.playerId, { wins: 1 });
  });
  const afterInc = await repos.roster.players.findById(created.playerId);
  console.log(`   → wins=${afterInc!.wins}`);

  console.log('5. deleting...');
  await repos.roster.players.delete(created.playerId);
  const gone = await repos.roster.players.findById(created.playerId);
  if (gone) throw new Error('player still exists after delete');
  console.log('   → gone');

  console.log('\nAll roster smoke checks passed.');
  await closeKyselyDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeKyselyDb();
  process.exit(1);
});
