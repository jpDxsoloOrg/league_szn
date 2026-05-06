import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { Match, MatchSlot, MatchStatus } from '../../lib/repositories/types';
import {
  success,
  badRequest,
  notFound,
  conflict,
  forbidden,
  serverError,
} from '../../lib/response';
import { getAuthContext, hasRole, requireRole } from '../../lib/auth';

/**
 * DELETE /matches/{matchId}/slots/{slotId}/claim
 *
 * Release (vacate) a previously-claimed slot. A wrestler can only release
 * their own slot and cannot release a slot the admin has locked. An admin
 * (Admin or Moderator) can release any slot, locked or not.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const matchId = event.pathParameters?.matchId;
    const slotId = event.pathParameters?.slotId;
    if (!matchId) return badRequest('matchId is required');
    if (!slotId) return badRequest('slotId is required');

    const authContext = getAuthContext(event);
    const isAdmin = hasRole(authContext, 'Moderator'); // hasRole('Moderator') is true for Admin + Moderator

    const {
      competition: { matches },
      roster: { players },
      runInTransaction,
    } = getRepositories();

    const match = await matches.findByIdWithDate(matchId);
    if (!match) return notFound('Match not found');

    if (match.status === 'completed' || match.status === 'cancelled') {
      return conflict(`Cannot release a slot on a ${match.status} match`);
    }

    const slots = match.slots;
    if (!slots || slots.length === 0) {
      return conflict('Match has no slots');
    }

    const slotIndex = slots.findIndex((s) => s.slotId === slotId);
    if (slotIndex < 0) return notFound('Slot not found');

    const slot = slots[slotIndex];

    // Already empty? Idempotent success — nothing to do.
    if (!slot.playerId) {
      return success(match);
    }

    if (slot.lockedByAdmin && !isAdmin) {
      return forbidden('Slot is locked by an admin and cannot be released');
    }

    if (!isAdmin) {
      // Non-admin must be the current claimant.
      const callerPlayer = await players.findByUserId(authContext.sub);
      if (!callerPlayer || callerPlayer.playerId !== slot.playerId) {
        return forbidden('You can only release your own slot');
      }
    }

    // Compute new state. Clearing a filled slot always re-opens signups.
    // invariant: participants mirrors filled slots; recompute on every write.
    const now = new Date().toISOString();
    const updatedSlots: MatchSlot[] = slots.map((s, i) => {
      if (i !== slotIndex) return s;
      const cleared: MatchSlot = {
        slotId: s.slotId,
        position: s.position,
      };
      if (s.lockedByAdmin) cleared.lockedByAdmin = true;
      if (s.teamLabel) cleared.teamLabel = s.teamLabel;
      return cleared;
    });
    const updatedParticipants = dedupeFilledPlayerIds(updatedSlots);
    const newStatus: MatchStatus = 'open-signups';

    await runInTransaction(async (tx) => {
      tx.updateMatch(matchId, match.date, {
        slots: updatedSlots,
        participants: updatedParticipants,
        status: newStatus,
        updatedAt: now,
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
    console.error('Error releasing slot:', err);
    return serverError('Failed to release slot');
  }
};

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
