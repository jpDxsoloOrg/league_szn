import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { Match, MatchSlot, MatchStatus } from '../../lib/repositories/types';
import {
  success,
  badRequest,
  notFound,
  serverError,
} from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

interface AdminUpdateSlotBody {
  /** undefined = no change; null = clear the slot; string = assign that player. */
  playerId?: string | null;
  /** undefined = no change; boolean = set the lock flag. */
  lockedByAdmin?: boolean;
  /** undefined = no change; null = clear; string = set. */
  teamLabel?: string | null;
}

/**
 * PUT /matches/{matchId}/slots/{slotId}
 *
 * Admin/moderator-only direct edit of a slot. Force-assign a player, clear
 * the slot, lock/unlock, or set the team label. Bypasses the open / locked /
 * dup-player-in-this-match checks that gate the wrestler-facing claim flow,
 * but still validates that any newly-assigned player exists.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Moderator');
  if (denied) return denied;

  try {
    const matchId = event.pathParameters?.matchId;
    const slotId = event.pathParameters?.slotId;
    if (!matchId) return badRequest('matchId is required');
    if (!slotId) return badRequest('slotId is required');

    const { data: body, error: parseError } = parseBody<AdminUpdateSlotBody>(event);
    if (parseError) return parseError;

    const {
      competition: { matches },
      roster: { players },
      runInTransaction,
    } = getRepositories();

    const match = await matches.findByIdWithDate(matchId);
    if (!match) return notFound('Match not found');

    const slots = match.slots;
    if (!slots || slots.length === 0) {
      return badRequest('Match has no slots to edit');
    }

    const slotIndex = slots.findIndex((s) => s.slotId === slotId);
    if (slotIndex < 0) return notFound('Slot not found');

    // Validate player exists when explicitly assigning. Null clears; undefined
    // leaves the existing playerId untouched.
    if (typeof body.playerId === 'string') {
      const player = await players.findById(body.playerId);
      if (!player) return notFound(`Player not found: ${body.playerId}`);
    }

    const now = new Date().toISOString();
    const original = slots[slotIndex];
    const updatedSlot = applySlotPatch(original, body, now);

    const updatedSlots: MatchSlot[] = slots.map((s, i) => (i === slotIndex ? updatedSlot : s));
    const updatedParticipants = dedupeFilledPlayerIds(updatedSlots);

    // Status: leave completed/cancelled matches alone; otherwise auto-flip
    // based on whether any slot is still open.
    const newStatus: MatchStatus =
      match.status === 'completed' || match.status === 'cancelled'
        ? match.status
        : updatedSlots.some((s) => !s.playerId)
          ? 'open-signups'
          : 'scheduled';

    // DynamoUnitOfWork.updateMatch appends updatedAt itself; passing it again
    // here would set the same path twice and fail validation.
    await runInTransaction(async (tx) => {
      tx.updateMatch(matchId, match.date, {
        slots: updatedSlots,
        participants: updatedParticipants,
        status: newStatus,
      });
    });

    const updated: Match = {
      ...match,
      slots: updatedSlots,
      participants: updatedParticipants,
      status: newStatus,
      updatedAt: now,
    };

    return success(updated);
  } catch (err) {
    console.error('Error admin-updating slot:', err);
    return serverError('Failed to update slot');
  }
};

function applySlotPatch(
  original: MatchSlot,
  body: AdminUpdateSlotBody,
  now: string,
): MatchSlot {
  const next: MatchSlot = {
    slotId: original.slotId,
    position: original.position,
  };

  // playerId / claimedAt
  if (body.playerId === null) {
    // explicit clear
  } else if (typeof body.playerId === 'string') {
    next.playerId = body.playerId;
    next.claimedAt = now;
  } else if (original.playerId) {
    next.playerId = original.playerId;
    if (original.claimedAt) next.claimedAt = original.claimedAt;
  }

  // lockedByAdmin
  if (body.lockedByAdmin === true) {
    next.lockedByAdmin = true;
  } else if (body.lockedByAdmin === false) {
    // explicit unlock — leave the flag off
  } else if (original.lockedByAdmin) {
    next.lockedByAdmin = true;
  }

  // teamLabel
  if (body.teamLabel === null) {
    // explicit clear
  } else if (typeof body.teamLabel === 'string') {
    next.teamLabel = body.teamLabel;
  } else if (original.teamLabel) {
    next.teamLabel = original.teamLabel;
  }

  return next;
}

function dedupeFilledPlayerIds(slots: MatchSlot[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of slots) {
    if (s.playerId && !seen.has(s.playerId)) {
      seen.add(s.playerId);
      out.push(s.playerId);
    }
  }
  return out;
}
