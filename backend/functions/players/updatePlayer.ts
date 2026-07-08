import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { NotFoundError } from '../../lib/repositories/errors';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import type { PlayerPatch } from '../../lib/repositories';
import {
  filterExistingWrestlerIds,
  rejectDuplicateSlotAssignment,
  resolveWrestlerForAssignment,
} from './wrestlerAssignment';

/**
 * Request shape for FK transitions on the two slots. `undefined` = no change,
 * `null` = clear the assignment, string = set to that wrestlerId.
 */
type SlotChange = { present: false } | { present: true; newId: string | null };

function parseSlotChange(value: unknown): SlotChange {
  if (value === undefined) return { present: false };
  if (value === null || value === '') return { present: true, newId: null };
  if (typeof value === 'string' && value.length > 0) {
    return { present: true, newId: value };
  }
  return { present: false };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('Player ID is required');

    const { data: body, error: parseError } = parseBody(event);
    if (parseError) return parseError;

    const { roster, leagueOps, runInTransaction } = getRepositories();
    const player = await roster.players.findById(playerId);
    if (!player) return notFound('Player not found');

    const patch: PlayerPatch = {};
    let hasChanges = false;

    if (body.name !== undefined) {
      patch.name = body.name as string;
      hasChanges = true;
    }
    if (body.imageUrl !== undefined) {
      patch.imageUrl = body.imageUrl as string;
      hasChanges = true;
    }
    if (body.psnId !== undefined) {
      patch.psnId = body.psnId as string;
      hasChanges = true;
    }

    if (body.canUploadVideos !== undefined) {
      if (typeof body.canUploadVideos !== 'boolean') {
        return badRequest('canUploadVideos must be a boolean');
      }
      patch.canUploadVideos = body.canUploadVideos;
      hasChanges = true;
    }

    if (body.alignment !== undefined) {
      if (body.alignment === '' || body.alignment === null) {
        patch.alignment = undefined;
        hasChanges = true;
      } else if (['face', 'heel', 'neutral'].includes(body.alignment as string)) {
        patch.alignment = body.alignment as 'face' | 'heel' | 'neutral';
        hasChanges = true;
      } else {
        return badRequest('Invalid alignment. Must be face, heel, or neutral');
      }
    }

    if (body.divisionId !== undefined) {
      if (body.divisionId === '' || body.divisionId === null) {
        patch.divisionId = undefined;
        hasChanges = true;
      } else {
        const division = await leagueOps.divisions.findById(
          body.divisionId as string,
        );
        if (!division) {
          return notFound(`Division ${body.divisionId} not found`);
        }
        patch.divisionId = body.divisionId as string;
        hasChanges = true;
      }
    }

    // Legacy free-text field: still accepted but only when the FK field is
    // not being changed on the same slot. The FK path always wins.
    if (
      body.currentWrestler !== undefined &&
      body.currentWrestlerId === undefined
    ) {
      patch.currentWrestler = body.currentWrestler as string;
      hasChanges = true;
    }
    if (
      body.alternateWrestler !== undefined &&
      body.alternateWrestlerId === undefined
    ) {
      if (body.alternateWrestler === '' || body.alternateWrestler === null) {
        patch.alternateWrestler = undefined;
      } else {
        patch.alternateWrestler = body.alternateWrestler as string;
      }
      hasChanges = true;
    }

    const currentChange = parseSlotChange(body.currentWrestlerId);
    const alternateChange = parseSlotChange(body.alternateWrestlerId);

    if (currentChange.present || alternateChange.present) {
      // Guard against picking the same wrestler for both slots, accounting
      // for whichever slot is unchanged.
      const finalCurrent = currentChange.present
        ? currentChange.newId
        : (player.currentWrestlerId ?? null);
      const finalAlternate = alternateChange.present
        ? alternateChange.newId
        : (player.alternateWrestlerId ?? null);
      const dupError = rejectDuplicateSlotAssignment(finalCurrent, finalAlternate);
      if (dupError) return dupError;
    }

    const toRelease: string[] = [];
    const toAssign: Array<{ wrestlerId: string; slot: 'primary' | 'alternate' }> =
      [];

    if (currentChange.present) {
      const oldId = player.currentWrestlerId;
      const newId = currentChange.newId;
      if (oldId && oldId !== newId) toRelease.push(oldId);
      if (newId) {
        // The edit form submits the full payload, so an unchanged slot echoes
        // the player's stored FK back. If that FK is stale (its roster row
        // was deleted, e.g. by a roster re-seed), failing the whole save
        // with a 404 would block editing every other field — skip the slot.
        const unchangedStale =
          newId === oldId &&
          (await filterExistingWrestlerIds([newId])).length === 0;
        if (!unchangedStale) {
          const r = await resolveWrestlerForAssignment(newId, playerId, 'primary');
          if ('error' in r) return r.error;
          toAssign.push({ wrestlerId: newId, slot: 'primary' });
          patch.currentWrestlerId = newId;
          patch.currentWrestler = r.wrestler.name;
        }
      } else {
        patch.currentWrestlerId = null;
      }
      hasChanges = true;
    }

    if (alternateChange.present) {
      const oldId = player.alternateWrestlerId;
      const newId = alternateChange.newId;
      if (oldId && oldId !== newId) toRelease.push(oldId);
      if (newId) {
        const unchangedStale =
          newId === oldId &&
          (await filterExistingWrestlerIds([newId])).length === 0;
        if (!unchangedStale) {
          const r = await resolveWrestlerForAssignment(newId, playerId, 'alternate');
          if ('error' in r) return r.error;
          toAssign.push({ wrestlerId: newId, slot: 'alternate' });
          patch.alternateWrestlerId = newId;
          patch.alternateWrestler = r.wrestler.name;
        }
      } else {
        patch.alternateWrestlerId = null;
        patch.alternateWrestler = undefined;
      }
      hasChanges = true;
    }

    if (!hasChanges) {
      return badRequest('No valid fields to update');
    }

    // If any FK transition happened, stage the player update + wrestler
    // release/assign atomically. Otherwise fall through to the simple update.
    if (toRelease.length > 0 || toAssign.length > 0) {
      const releasable = await filterExistingWrestlerIds(toRelease);
      await runInTransaction(async (tx) => {
        for (const wrestlerId of releasable) {
          tx.releaseWrestlerFromPlayer({ wrestlerId });
        }
        for (const { wrestlerId, slot } of toAssign) {
          tx.assignWrestlerToPlayer({ wrestlerId, playerId, slot });
        }
        tx.updatePlayer(playerId, patch as Record<string, unknown>);
      });
      const refreshed = await roster.players.findById(playerId);
      return success(refreshed);
    }

    const updated = await roster.players.update(playerId, patch);
    return success(updated);
  } catch (err) {
    if (err instanceof NotFoundError) return notFound(err.message);
    console.error('Error updating player:', err);
    return serverError('Failed to update player');
  }
};
