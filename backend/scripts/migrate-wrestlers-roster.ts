// Set up environment for local / devtest DynamoDB before importing anything.
// The calling shell is expected to set AWS creds + WRESTLERS_TABLE / PLAYERS_TABLE
// via `sls print` or equivalent. For local use, `IS_OFFLINE=true` targets the
// DynamoDB Local container.
process.env.DB_DRIVER = process.env.DB_DRIVER || 'dynamo';

import { getRepositories } from '../lib/repositories';
import '../lib/repositories/dynamo';
import type { Player, WrestlerPromotion } from '../lib/repositories/types';

/**
 * One-time migration from the legacy free-text `currentWrestler` /
 * `alternateWrestler` fields on Players to the new `currentWrestlerId` /
 * `alternateWrestlerId` FKs + `Wrestlers` roster rows.
 *
 * Semantics:
 * 1. Scan Players; collect unique (case-insensitive) wrestler names.
 * 2. For each unique name, find or create a Wrestler row under promotion
 *    `OTHER` with overallCap = the floor (70). Admins curate promotion +
 *    overallCap later via ManageWrestlers.
 * 3. Back-fill each Player: set `currentWrestlerId` / `alternateWrestlerId`
 *    to the matching wrestler. Leave the denormalized string fields intact
 *    (they're the display cache).
 * 4. For the first player that claims a given wrestler, mark the wrestler
 *    `isInUse=true` + `assignedPlayerId` + `assignedSlot`. Subsequent
 *    claimants are logged as conflicts and left unassigned — admin fixes
 *    them manually via ManageWrestlers.
 *
 * Rollback: drop the Wrestlers table; the FK fields on Players are additive
 * and can be ignored by older code.
 *
 * Dry-run: pass `--dry-run` to log the plan without writing anything.
 */

const OTHER_PROMOTION: WrestlerPromotion = 'OTHER';
const OVERALL_CAP_FLOOR = 70;

interface MigrationSummary {
  playersScanned: number;
  uniqueNames: number;
  wrestlersCreated: number;
  wrestlersReused: number;
  playersLinked: number;
  conflicts: Array<{ wrestlerName: string; keptPlayerId: string; conflictingPlayerId: string; slot: 'primary' | 'alternate' }>;
}

function normalize(name: string | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

async function migrate(dryRun: boolean): Promise<MigrationSummary> {
  const { roster, runInTransaction } = getRepositories();

  console.log(`Starting wrestler-roster migration (dryRun=${dryRun})...`);

  const players: Player[] = await roster.players.list();
  const summary: MigrationSummary = {
    playersScanned: players.length,
    uniqueNames: 0,
    wrestlersCreated: 0,
    wrestlersReused: 0,
    playersLinked: 0,
    conflicts: [],
  };

  // normalizedName -> wrestlerId
  const nameToWrestlerId = new Map<string, string>();
  // wrestlerId -> { playerId, slot } — the first owner of that wrestler
  const wrestlerOwners = new Map<string, { playerId: string; slot: 'primary' | 'alternate' }>();

  for (const player of players) {
    for (const slot of ['primary', 'alternate'] as const) {
      const raw =
        slot === 'primary' ? player.currentWrestler : player.alternateWrestler;
      const name = normalize(raw);
      if (!name) continue;

      const key = name.toLowerCase();
      let wrestlerId = nameToWrestlerId.get(key);

      if (!wrestlerId) {
        // Look for an existing OTHER-promotion wrestler with that name before
        // creating a new one — makes the script idempotent across re-runs.
        const existing = await roster.wrestlers.findByName(OTHER_PROMOTION, name);
        if (existing) {
          wrestlerId = existing.wrestlerId;
          summary.wrestlersReused += 1;
        } else if (dryRun) {
          wrestlerId = `DRY-${key}`;
          summary.wrestlersCreated += 1;
        } else {
          const created = await roster.wrestlers.create({
            promotion: OTHER_PROMOTION,
            name,
            overallCap: OVERALL_CAP_FLOOR,
          });
          wrestlerId = created.wrestlerId;
          summary.wrestlersCreated += 1;
        }
        nameToWrestlerId.set(key, wrestlerId);
      }

      const claimant = wrestlerOwners.get(wrestlerId);
      if (claimant) {
        // Second+ player claims this wrestler — conflict, log and skip.
        summary.conflicts.push({
          wrestlerName: name,
          keptPlayerId: claimant.playerId,
          conflictingPlayerId: player.playerId,
          slot,
        });
        continue;
      }

      wrestlerOwners.set(wrestlerId, { playerId: player.playerId, slot });

      if (dryRun) {
        summary.playersLinked += 1;
        continue;
      }

      // Stage the player FK set + wrestler assignment atomically.
      await runInTransaction(async (tx) => {
        tx.assignWrestlerToPlayer({
          wrestlerId: wrestlerId!,
          playerId: player.playerId,
          slot,
        });
        tx.updatePlayer(player.playerId, {
          [slot === 'primary' ? 'currentWrestlerId' : 'alternateWrestlerId']:
            wrestlerId,
        });
      });
      summary.playersLinked += 1;
    }
  }

  summary.uniqueNames = nameToWrestlerId.size;
  return summary;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  try {
    const summary = await migrate(dryRun);
    console.log('\nMigration summary:');
    console.log(`  Players scanned:      ${summary.playersScanned}`);
    console.log(`  Unique wrestler names:${summary.uniqueNames}`);
    console.log(`  Wrestlers created:    ${summary.wrestlersCreated}`);
    console.log(`  Wrestlers reused:     ${summary.wrestlersReused}`);
    console.log(`  Players linked:       ${summary.playersLinked}`);
    console.log(`  Conflicts:            ${summary.conflicts.length}`);
    for (const c of summary.conflicts) {
      console.log(
        `    - "${c.wrestlerName}" (slot ${c.slot}): kept=${c.keptPlayerId}, skipped=${c.conflictingPlayerId}`,
      );
    }
    if (dryRun) console.log('\n(dry-run: no writes performed)');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

void main();
