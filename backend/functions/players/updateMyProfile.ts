import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { NotFoundError } from '../../lib/repositories/errors';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { getAuthContext, requireRole } from '../../lib/auth';
import type { PlayerPatch } from '../../lib/repositories';
import {
  rejectDuplicateSlotAssignment,
  resolveWrestlerForAssignment,
} from './wrestlerAssignment';

const STRING_FIELDS = [
  'name',
  'currentWrestler',
  'alternateWrestler',
  'imageUrl',
  'psnId',
  'alignment',
] as const;
const FK_FIELDS = ['currentWrestlerId', 'alternateWrestlerId'] as const;
const MAX_NAME_LENGTH = 100;
const MAX_URL_LENGTH = 2048;

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
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const { sub } = getAuthContext(event);
    const { data: body, error: parseError } = parseBody(event);
    if (parseError) return parseError;

    const { roster, runInTransaction } = getRepositories();
    const player = await roster.players.findByUserId(sub);
    if (!player) return notFound('No player profile found for this user');
    const playerId = player.playerId;

    const patch: PlayerPatch = {};
    let hasChanges = false;

    // Validate and apply string fields.
    for (const field of STRING_FIELDS) {
      if (body[field] === undefined) continue;
      const value = body[field];
      if (typeof value !== 'string') {
        return badRequest(`Field ${field} must be a string`);
      }

      if (field === 'alternateWrestler' && value === '') {
        // Only let the legacy text clear when no FK is being set on the slot.
        if (body.alternateWrestlerId === undefined) {
          patch.alternateWrestler = undefined;
          hasChanges = true;
        }
        continue;
      }

      if (field === 'alignment') {
        if (value === '') {
          patch.alignment = undefined;
          hasChanges = true;
          continue;
        }
        if (!['face', 'heel', 'neutral'].includes(value)) {
          return badRequest('Invalid alignment. Must be face, heel, or neutral');
        }
      }

      if (
        (field === 'name' ||
          field === 'currentWrestler' ||
          field === 'alternateWrestler') &&
        value.length > MAX_NAME_LENGTH
      ) {
        return badRequest(
          `Field ${field} must be ${MAX_NAME_LENGTH} characters or less`,
        );
      }

      if (field === 'name' && value.trim().length === 0) {
        return badRequest('Name cannot be empty');
      }

      if (field === 'psnId' && value.length > MAX_NAME_LENGTH) {
        return badRequest(`PSN ID must be ${MAX_NAME_LENGTH} characters or less`);
      }

      if (field === 'imageUrl' && value.length > MAX_URL_LENGTH) {
        return badRequest(`Image URL must be ${MAX_URL_LENGTH} characters or less`);
      }

      // Skip the legacy text when an FK is set on the same slot — FK wins.
      if (field === 'currentWrestler' && body.currentWrestlerId !== undefined) {
        continue;
      }
      if (field === 'alternateWrestler' && body.alternateWrestlerId !== undefined) {
        continue;
      }

      (patch as Record<string, unknown>)[field] = value;
      hasChanges = true;
    }

    // Parse FK changes.
    const currentChange = parseSlotChange(body.currentWrestlerId);
    const alternateChange = parseSlotChange(body.alternateWrestlerId);

    if (currentChange.present || alternateChange.present) {
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
        const r = await resolveWrestlerForAssignment(newId, playerId, 'primary');
        if ('error' in r) return r.error;
        toAssign.push({ wrestlerId: newId, slot: 'primary' });
        patch.currentWrestlerId = newId;
        patch.currentWrestler = r.wrestler.name;
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
        const r = await resolveWrestlerForAssignment(newId, playerId, 'alternate');
        if ('error' in r) return r.error;
        toAssign.push({ wrestlerId: newId, slot: 'alternate' });
        patch.alternateWrestlerId = newId;
        patch.alternateWrestler = r.wrestler.name;
      } else {
        patch.alternateWrestlerId = null;
        patch.alternateWrestler = undefined;
      }
      hasChanges = true;
    }

    if (!hasChanges) {
      const all = [...STRING_FIELDS, ...FK_FIELDS].join(', ');
      return badRequest(`No valid fields to update. Allowed fields: ${all}`);
    }

    if (toRelease.length > 0 || toAssign.length > 0) {
      await runInTransaction(async (tx) => {
        for (const wrestlerId of toRelease) {
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
    console.error('Error updating player profile:', err);
    return serverError('Failed to update player profile');
  }
};
