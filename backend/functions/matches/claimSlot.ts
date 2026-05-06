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
import { getAuthContext, requireRole } from '../../lib/auth';

/**
 * POST /matches/{matchId}/slots/{slotId}/claim
 *
 * The caller (a wrestler) claims an open slot on a slot-mode match.
 * Idempotent: if the caller already occupies the slot, the request succeeds
 * without changing anything.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const matchId = event.pathParameters?.matchId;
    const slotId = event.pathParameters?.slotId;
    if (!matchId) return badRequest('matchId is required');
    if (!slotId) return badRequest('slotId is required');

    const { sub } = getAuthContext(event);
    const {
      competition: { matches },
      leagueOps: { events: eventsRepo },
      roster: { players },
      runInTransaction,
    } = getRepositories();

    const callerPlayer = await players.findByUserId(sub);
    if (!callerPlayer) {
      return forbidden('No player profile is linked to this account');
    }
    const callerPlayerId = callerPlayer.playerId;

    const match = await matches.findByIdWithDate(matchId);
    if (!match) return notFound('Match not found');

    if (match.status !== 'open-signups') {
      return conflict('Match is not open for signups');
    }

    const slots = match.slots;
    if (!slots || slots.length === 0) {
      return conflict('Match has no slots');
    }

    const slotIndex = slots.findIndex((s) => s.slotId === slotId);
    if (slotIndex < 0) return notFound('Slot not found');

    const slot = slots[slotIndex];

    if (slot.playerId === callerPlayerId) {
      // Idempotent re-claim — no-op success
      return success(match);
    }

    if (slot.lockedByAdmin) {
      return conflict('Slot is locked by an admin');
    }

    if (slot.playerId) {
      return conflict('Slot is already claimed');
    }

    const callerInOtherSlot = slots.some(
      (s) => s.slotId !== slotId && s.playerId === callerPlayerId,
    );
    if (callerInOtherSlot) {
      return conflict('You already occupy another slot in this match');
    }

    // Event-level gate: reject claims on events that are past, completed, or cancelled.
    if (match.eventId) {
      const linkedEvent = await eventsRepo.findById(match.eventId);
      if (linkedEvent) {
        if (linkedEvent.status === 'completed' || linkedEvent.status === 'cancelled') {
          return conflict('Event is no longer accepting signups');
        }
        if (linkedEvent.date && new Date(linkedEvent.date).getTime() < Date.now()) {
          return conflict('Event has already started');
        }
      }
    }

    // Compute new slot/participant/status state.
    // invariant: participants mirrors filled slots; recompute on every write.
    const now = new Date().toISOString();
    const updatedSlots: MatchSlot[] = slots.map((s, i) => {
      if (i !== slotIndex) return s;
      return {
        ...s,
        playerId: callerPlayerId,
        claimedAt: now,
      };
    });
    const updatedParticipants = dedupeFilledPlayerIds(updatedSlots);
    const newStatus: MatchStatus = updatedSlots.some((s) => !s.playerId)
      ? 'open-signups'
      : 'scheduled';

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
    console.error('Error claiming slot:', err);
    return serverError('Failed to claim slot');
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
