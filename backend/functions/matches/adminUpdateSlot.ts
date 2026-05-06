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
  /**
   * MSL-03: which of the assigned player's wrestlers to use for this match.
   * Silent default 'main' when assigning a new player and the body omits
   * this — admins shouldn't be forced through a radio for every scripted
   * booking. Honored when explicitly set, including switching the radio on
   * an existing claimant without changing the player.
   */
  wrestlerChoice?: 'main' | 'alternate';
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

    const now = new Date().toISOString();
    const original = slots[slotIndex];

    // ── Wrestler-choice resolution (MSL-03) ─────────────────────────────
    // - Clear (playerId: null): wipe playerId, claimedAt, wrestlerChoice,
    //   wrestlerNameSnapshot — the slot becomes a fresh open spot.
    // - Re-assign (playerId is a string): fetch that player; resolve choice
    //   from the body or default silently to 'main'; snapshot the matching
    //   wrestler name.
    // - Switch radio only (playerId omitted, wrestlerChoice provided):
    //   re-fetch the existing claimant's player to recompute the snapshot.
    // - No relevant change: preserve original.
    const isClearing = body.playerId === null;
    const newPlayerId = typeof body.playerId === 'string' ? body.playerId : null;

    let resolvedPlayerId: string | undefined = original.playerId;
    let resolvedClaimedAt: string | undefined = original.claimedAt;
    let resolvedChoice: 'main' | 'alternate' | undefined = original.wrestlerChoice;
    let resolvedSnapshot: string | undefined = original.wrestlerNameSnapshot;

    if (isClearing) {
      resolvedPlayerId = undefined;
      resolvedClaimedAt = undefined;
      resolvedChoice = undefined;
      resolvedSnapshot = undefined;
    } else if (newPlayerId !== null) {
      const player = await players.findById(newPlayerId);
      if (!player) return notFound(`Player not found: ${newPlayerId}`);
      resolvedPlayerId = newPlayerId;
      resolvedClaimedAt = now;
      resolvedChoice = body.wrestlerChoice === 'alternate' ? 'alternate' : 'main';
      resolvedSnapshot =
        resolvedChoice === 'alternate' && player.alternateWrestler
          ? player.alternateWrestler
          : player.currentWrestler;
    } else if (body.wrestlerChoice && original.playerId) {
      const player = await players.findById(original.playerId);
      if (!player) return notFound(`Player not found: ${original.playerId}`);
      resolvedChoice = body.wrestlerChoice === 'alternate' ? 'alternate' : 'main';
      resolvedSnapshot =
        resolvedChoice === 'alternate' && player.alternateWrestler
          ? player.alternateWrestler
          : player.currentWrestler;
    }

    const updatedSlot = buildUpdatedSlot(original, body, {
      playerId: resolvedPlayerId,
      claimedAt: resolvedClaimedAt,
      wrestlerChoice: resolvedChoice,
      wrestlerNameSnapshot: resolvedSnapshot,
    });

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

interface ResolvedWrestlerFields {
  playerId: string | undefined;
  claimedAt: string | undefined;
  wrestlerChoice: 'main' | 'alternate' | undefined;
  wrestlerNameSnapshot: string | undefined;
}

function buildUpdatedSlot(
  original: MatchSlot,
  body: AdminUpdateSlotBody,
  resolved: ResolvedWrestlerFields,
): MatchSlot {
  const next: MatchSlot = {
    slotId: original.slotId,
    position: original.position,
  };

  // Wrestler fields are pre-resolved (clear / reassign / radio-only / preserve)
  // — only emit when there's a value, so we don't write `undefined` into Dynamo.
  if (resolved.playerId) next.playerId = resolved.playerId;
  if (resolved.claimedAt) next.claimedAt = resolved.claimedAt;
  if (resolved.wrestlerChoice) next.wrestlerChoice = resolved.wrestlerChoice;
  if (resolved.wrestlerNameSnapshot) next.wrestlerNameSnapshot = resolved.wrestlerNameSnapshot;

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
