import { APIGatewayProxyHandler } from 'aws-lambda';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { getRepositories } from '../../lib/repositories';
import type { Player, Wrestler } from '../../lib/repositories/types';
import { parseBody } from '../../lib/parseBody';
import { badRequest, serverError, success } from '../../lib/response';
import { NEEDS_WRESTLER } from '../../lib/needsWrestler';

/** The admin must type this exact value; ManageWrestlers.tsx sends it as `confirm`. */
export const RESET_ASSIGNMENTS_CONFIRM_TOKEN = 'RESET-ALL-ASSIGNMENTS';

interface ResetAssignmentsBody {
  confirm: typeof RESET_ASSIGNMENTS_CONFIRM_TOKEN;
}

function isResetAssignmentsBody(body: unknown): body is ResetAssignmentsBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as Record<string, unknown>).confirm === RESET_ASSIGNMENTS_CONFIRM_TOKEN
  );
}

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

/**
 * Store the rows about to change so a reset can be undone, returning where they
 * went. Any failure here aborts the reset before a single row is written. The
 * images bucket is publicly readable, so the snapshot is limited to fields the
 * public player and wrestler endpoints already return, under a random key.
 */
async function saveAssignmentSnapshot(
  wrestlers: Wrestler[],
  players: Player[],
): Promise<string> {
  const takenAt = new Date().toISOString();
  const snapshot = JSON.stringify({
    takenAt,
    wrestlers: wrestlers.map(({ wrestlerId, isInUse, assignedPlayerId, assignedSlot }) => ({
      wrestlerId,
      isInUse,
      assignedPlayerId,
      assignedSlot,
    })),
    players: players.map(
      ({ playerId, currentWrestler, currentWrestlerId, alternateWrestler, alternateWrestlerId }) => ({
        playerId,
        currentWrestler,
        currentWrestlerId,
        alternateWrestler,
        alternateWrestlerId,
      }),
    ),
  });
  const snapshotKey = `backups/wrestler-assignments/${takenAt}-${uuidv4()}.json`;

  // There is no S3 in local development, so the log stands in for the object.
  if (process.env.IS_OFFLINE === 'true') {
    console.log('Wrestler assignment snapshot:', snapshotKey, snapshot);
    return snapshotKey;
  }

  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.IMAGES_BUCKET,
      Key: snapshotKey,
      Body: snapshot,
      ContentType: 'application/json',
    }),
  );
  return snapshotKey;
}

/**
 * POST /wrestlers/reset-assignments (admin)
 *
 * Bulk-clears every wrestler assignment in the league:
 * - Every wrestler that is in use (or still carries an `assignedPlayerId`)
 *   is released: `isInUse=false`, REMOVE `assignedPlayerId`/`assignedSlot`
 *   (same staging as the single-release path in updatePlayer/deletePlayer).
 * - Every player with a wrestler FK gets `currentWrestlerId` /
 *   `alternateWrestlerId` removed, along with the denormalized display
 *   names (`currentWrestler` is set to the NEEDS_WRESTLER placeholder since
 *   it's a required field; `alternateWrestler` is removed).
 *
 * The body must be `{ "confirm": RESET_ASSIGNMENTS_CONFIRM_TOKEN }`. The prior
 * assignments are snapshotted before anything is written.
 *
 * All mutations are staged through the unit of work, which flushes
 * TransactWriteItems in ≤100-item chunks, so a large reset is not atomic and
 * the snapshot is what covers a failure between chunks.
 *
 * Returns { clearedWrestlers, clearedPlayers, snapshotKey }, without
 * snapshotKey when there was nothing to clear.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const { data: body, error: parseError } = parseBody<unknown>(event);
  if (parseError) return parseError;
  if (!isResetAssignmentsBody(body)) {
    return badRequest(`confirm must be "${RESET_ASSIGNMENTS_CONFIRM_TOKEN}"`);
  }

  try {
    const { roster, runInTransaction } = getRepositories();

    const [wrestlers, players] = await Promise.all([
      roster.wrestlers.list(),
      roster.players.list(),
    ]);

    const assignedWrestlers = wrestlers.filter(
      (wrestler) => wrestler.isInUse || wrestler.assignedPlayerId !== undefined,
    );
    const assignedPlayers = players.filter(
      (player) => player.currentWrestlerId || player.alternateWrestlerId,
    );

    if (assignedWrestlers.length === 0 && assignedPlayers.length === 0) {
      return success({ clearedWrestlers: 0, clearedPlayers: 0 });
    }

    const snapshotKey = await saveAssignmentSnapshot(assignedWrestlers, assignedPlayers);

    await runInTransaction(async (tx) => {
      for (const wrestler of assignedWrestlers) {
        tx.releaseWrestlerFromPlayer({ wrestlerId: wrestler.wrestlerId });
      }
      for (const player of assignedPlayers) {
        const patch: Record<string, unknown> = {};
        if (player.currentWrestlerId) {
          patch.currentWrestlerId = null;
          patch.currentWrestler = NEEDS_WRESTLER;
        }
        if (player.alternateWrestlerId) {
          patch.alternateWrestlerId = null;
          patch.alternateWrestler = null;
        }
        tx.updatePlayer(player.playerId, patch);
      }
    });

    return success({
      clearedWrestlers: assignedWrestlers.length,
      clearedPlayers: assignedPlayers.length,
      snapshotKey,
    });
  } catch (err) {
    console.error('Error resetting wrestler assignments:', err);
    return serverError('Failed to reset wrestler assignments');
  }
};
