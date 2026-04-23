import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { ConcurrencyError, ConflictError } from '../../lib/repositories/errors';
import {
  badRequest,
  conflict,
  created,
  notFound,
  serverError,
} from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import type { PlayerCreateInput } from '../../lib/repositories';
import {
  rejectDuplicateSlotAssignment,
  resolveWrestlerForAssignment,
} from './wrestlerAssignment';

/**
 * Create a player. Accepts either the legacy free-text `currentWrestler`
 * string (kept for migration) or the new `currentWrestlerId` FK. When FKs
 * are provided, the wrestlers' `isInUse` + `assignedPlayerId` + `assignedSlot`
 * are staged in a single UoW after the player row is written. The player
 * record carries both the denormalized name (display cache) and the FK.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { data: body, error: parseError } = parseBody(event);
    if (parseError) return parseError;

    const raw = body as Record<string, unknown>;

    if (typeof raw.name !== 'string' || raw.name.trim().length === 0) {
      return badRequest('name is required');
    }

    const currentWrestlerId =
      typeof raw.currentWrestlerId === 'string' && raw.currentWrestlerId.length > 0
        ? raw.currentWrestlerId
        : undefined;
    const alternateWrestlerId =
      typeof raw.alternateWrestlerId === 'string' &&
      raw.alternateWrestlerId.length > 0
        ? raw.alternateWrestlerId
        : undefined;

    const dupError = rejectDuplicateSlotAssignment(
      currentWrestlerId,
      alternateWrestlerId,
    );
    if (dupError) return dupError;

    // Resolve FK wrestlers up-front (if any) so we can populate the
    // denormalized `currentWrestler` / `alternateWrestler` name fields from
    // the roster and fail fast on conflicts before any writes.
    let resolvedCurrent: string | undefined;
    let resolvedAlternate: string | undefined;
    if (currentWrestlerId) {
      const r = await resolveWrestlerForAssignment(
        currentWrestlerId,
        null,
        'primary',
      );
      if ('error' in r) return r.error;
      resolvedCurrent = r.wrestler.name;
    }
    if (alternateWrestlerId) {
      const r = await resolveWrestlerForAssignment(
        alternateWrestlerId,
        null,
        'alternate',
      );
      if ('error' in r) return r.error;
      resolvedAlternate = r.wrestler.name;
    }

    // Legacy path: admin supplies `currentWrestler` as free text. Required
    // unless the new FK path is used.
    const currentWrestlerFreeText =
      typeof raw.currentWrestler === 'string' ? raw.currentWrestler : undefined;
    const currentWrestler = resolvedCurrent ?? currentWrestlerFreeText;
    if (!currentWrestler) {
      return badRequest('currentWrestler or currentWrestlerId is required');
    }

    const alternateWrestlerFreeText =
      typeof raw.alternateWrestler === 'string'
        ? raw.alternateWrestler
        : undefined;
    const alternateWrestler = resolvedAlternate ?? alternateWrestlerFreeText;

    if (typeof raw.divisionId === 'string' && raw.divisionId.length > 0) {
      const division = await getRepositories().leagueOps.divisions.findById(
        raw.divisionId,
      );
      if (!division) {
        return notFound(`Division ${raw.divisionId} not found`);
      }
    }

    const input: PlayerCreateInput = {
      name: raw.name,
      currentWrestler,
      ...(alternateWrestler ? { alternateWrestler } : {}),
      ...(currentWrestlerId ? { currentWrestlerId } : {}),
      ...(alternateWrestlerId ? { alternateWrestlerId } : {}),
      ...(typeof raw.imageUrl === 'string' ? { imageUrl: raw.imageUrl } : {}),
      ...(typeof raw.psnId === 'string' ? { psnId: raw.psnId } : {}),
      ...(typeof raw.divisionId === 'string' && raw.divisionId.length > 0
        ? { divisionId: raw.divisionId }
        : {}),
    };

    const { roster, runInTransaction } = getRepositories();
    const player = await roster.players.create(input);

    if (currentWrestlerId || alternateWrestlerId) {
      try {
        await runInTransaction(async (tx) => {
          if (currentWrestlerId) {
            tx.assignWrestlerToPlayer({
              wrestlerId: currentWrestlerId,
              playerId: player.playerId,
              slot: 'primary',
            });
          }
          if (alternateWrestlerId) {
            tx.assignWrestlerToPlayer({
              wrestlerId: alternateWrestlerId,
              playerId: player.playerId,
              slot: 'alternate',
            });
          }
        });
      } catch (assignErr) {
        // Best-effort compensation: the player row is already written but the
        // wrestler assignment failed. Remove the orphan so the admin can
        // retry cleanly.
        console.error(
          'Wrestler assignment failed after player create; rolling back player',
          assignErr,
        );
        await roster.players.delete(player.playerId).catch((cleanupErr) => {
          console.error('Rollback delete also failed', cleanupErr);
        });
        throw assignErr;
      }
    }

    return created(player);
  } catch (err) {
    if (err instanceof ConflictError) return conflict(err.message);
    if (err instanceof ConcurrencyError) return conflict(err.message);
    console.error('Error creating player:', err);
    return serverError('Failed to create player');
  }
};
