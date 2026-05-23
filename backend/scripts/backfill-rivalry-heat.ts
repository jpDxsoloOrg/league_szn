// Set up environment for local DynamoDB / chosen stage before importing
// anything else. The operator overrides STAGE / DYNAMODB_ENDPOINT /
// AWS_PROFILE on the command line when running against a real env, e.g.:
//   AWS_PROFILE=league-szn STAGE=devtest \
//     SERVICE_NAME=wwe-2k-league-api \
//     ts-node scripts/backfill-rivalry-heat.ts
//
// Locally (against DynamoDB Local on port 8000) just `npm run
// backfill-rivalry-heat` is enough — `IS_OFFLINE=true` is the default.
if (process.env.IS_OFFLINE === undefined) {
  process.env.IS_OFFLINE = 'true';
}
process.env.DB_DRIVER ||= 'dynamo';

import { getRepositories } from '../lib/repositories';
import { recomputeRivalryHeat } from '../lib/services/recomputeRivalryHeat';
import type { Rivalry, RivalryStatus } from '../lib/repositories';

const ALL_STATUSES: ReadonlyArray<RivalryStatus> = [
  'pending',
  'active',
  'completed',
  'rejected',
  'cancelled',
];

const PAGE_SIZE = 200;

async function listAllRivalries(): Promise<Rivalry[]> {
  const { rivalries } = getRepositories();
  const seen = new Set<string>();
  const out: Rivalry[] = [];
  for (const status of ALL_STATUSES) {
    let cursor: string | undefined;
    do {
      const page = await rivalries.listByStatus(status, { limit: PAGE_SIZE, cursor });
      for (const r of page.items) {
        if (seen.has(r.rivalryId)) continue;
        seen.add(r.rivalryId);
        out.push(r);
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }
  return out;
}

async function recomputeAll(): Promise<void> {
  const rivalries = await listAllRivalries();
  console.log(`\nFound ${rivalries.length} rivalries across all statuses.`);
  if (rivalries.length === 0) return;

  let written = 0;
  for (const rivalry of rivalries) {
    try {
      const result = await recomputeRivalryHeat(rivalry.rivalryId);
      console.log(
        `[${rivalry.rivalryId}] heatScore=${result.heatScore} tier=${result.heat} ` +
          `(rated matches: ${result.ratedMatchCount})`,
      );
      written += 1;
    } catch (err) {
      console.error(`[${rivalry.rivalryId}] FAILED:`, err);
    }
  }
  console.log(`\nRecomputed heat for ${written}/${rivalries.length} rivalries.`);
}

async function clearLegacyStarRatings(): Promise<void> {
  console.log('\nScanning completed matches for legacy starRating cleanup…');
  const { competition, runInTransaction } = getRepositories();
  const all = await competition.matches.list();

  // Pre-RIV-20 the GM hand-entered `starRating` on each match; that value
  // no longer reflects the new "average of user ratings" semantics. Wipe
  // it from any completed match that doesn't yet have user ratings so
  // the UI doesn't show stale half-stars.
  const stale = all.filter(
    (m) =>
      m.status === 'completed' &&
      (m.starRating ?? 0) > 0 &&
      !(m.ratingsCount && m.ratingsCount > 0),
  );

  if (stale.length === 0) {
    console.log('No stale legacy starRating values found.');
    return;
  }

  console.log(`Clearing legacy starRating on ${stale.length} completed matches…`);

  // Chunk into transactions of ≤25 so we stay well under the
  // TransactWriteItems 100-item cap (some matches share the same date
  // partition; cheaper to be conservative than diagnose a runtime cap).
  const CHUNK = 25;
  for (let i = 0; i < stale.length; i += CHUNK) {
    const slice = stale.slice(i, i + CHUNK);
    await runInTransaction(async (tx) => {
      for (const m of slice) {
        tx.updateMatch(m.matchId, m.date, {
          starRating: 0,
          ratingAverage: 0,
          ratingsCount: 0,
        });
      }
    });
    console.log(`  cleared ${Math.min(i + CHUNK, stale.length)}/${stale.length}`);
  }
}

async function main(): Promise<void> {
  console.log('Starting rivalry-heat backfill…');
  await recomputeAll();
  await clearLegacyStarRatings();
  console.log('\nBackfill complete.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
