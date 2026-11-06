import { APIGatewayProxyResult } from 'aws-lambda';
import { badRequest, conflict, notFound } from '../../lib/response';
import { getRepositories } from '../../lib/repositories';
import { NEEDS_WRESTLER } from '../../lib/needsWrestler';
import type { Player, Wrestler } from '../../lib/repositories/types';

export interface ResolvedWrestler {
  wrestler: Wrestler;
}

/**
 * Resolve a wrestler FK and verify it's available for assignment to `playerId`
 * on the given `slot`. A wrestler is available if it's not in use, or it's
 * already assigned to this same player on the same slot (idempotent re-assign).
 * Returns either the wrestler or an HTTP error response.
 */
export async function resolveWrestlerForAssignment(
  wrestlerId: string,
  playerId: string | null,
  slot: 'primary' | 'alternate',
): Promise<{ wrestler: Wrestler } | { error: APIGatewayProxyResult }> {
  const { roster } = getRepositories();
  const wrestler = await roster.wrestlers.findById(wrestlerId);
  if (!wrestler) {
    return { error: notFound(`Wrestler ${wrestlerId} not found`) };
  }
  if (wrestler.isInUse) {
    // Allow idempotent self-reassignment: same player + same slot.
    const sameOwner =
      playerId !== null &&
      wrestler.assignedPlayerId === playerId &&
      wrestler.assignedSlot === slot;
    if (!sameOwner) {
      return {
        error: conflict(
          `Wrestler ${wrestler.name} is already assigned to another player`,
        ),
      };
    }
  } else if (wrestler.assignedPlayerId && wrestler.assignedPlayerId !== playerId) {
    // Older releases flipped `isInUse` without touching the player, so the flag
    // alone can say "free" while a player still holds the wrestler.
    const holder = await roster.players.findById(wrestler.assignedPlayerId);
    if (
      holder?.currentWrestlerId === wrestlerId ||
      holder?.alternateWrestlerId === wrestlerId
    ) {
      return {
        error: conflict(
          `Wrestler ${wrestler.name} is already assigned to another player`,
        ),
      };
    }
  }
  return { wrestler };
}

/**
 * Every player holding the wrestler in either slot. Reads the players rather
 * than trusting `assignedPlayerId`, which can disagree with them, and more than
 * one player can hold the same wrestler after such a desync.
 */
export async function findWrestlerHolders(wrestlerId: string): Promise<Player[]> {
  const players = await getRepositories().roster.players.list();
  return players.filter(
    (player) =>
      player.currentWrestlerId === wrestlerId ||
      player.alternateWrestlerId === wrestlerId,
  );
}

/** Player patch that empties whichever slots hold the wrestler. */
export function buildWrestlerReleasePatch(
  player: Player,
  wrestlerId: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (player.currentWrestlerId === wrestlerId) {
    patch.currentWrestlerId = null;
    patch.currentWrestler = NEEDS_WRESTLER;
  }
  if (player.alternateWrestlerId === wrestlerId) {
    patch.alternateWrestlerId = null;
    patch.alternateWrestler = null;
  }
  return patch;
}

/**
 * Player patch that refreshes the denormalized name in whichever slots hold the
 * wrestler. Empty when the player already shows `wrestlerName`.
 */
export function buildWrestlerRenamePatch(
  player: Player,
  wrestlerId: string,
  wrestlerName: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (player.currentWrestlerId === wrestlerId && player.currentWrestler !== wrestlerName) {
    patch.currentWrestler = wrestlerName;
  }
  if (player.alternateWrestlerId === wrestlerId && player.alternateWrestler !== wrestlerName) {
    patch.alternateWrestler = wrestlerName;
  }
  return patch;
}

/**
 * Filter a list of wrestler FKs down to the ones that still exist in the
 * roster. A player row can hold a stale wrestlerId (the wrestler was deleted
 * out from under it), and releasing a nonexistent id would upsert a ghost
 * roster row — DynamoUnitOfWork conditions its writes on existence, so an
 * unfiltered stale id would fail the whole transaction instead. Skipping the
 * release is the right outcome: there is nothing to free.
 */
export async function filterExistingWrestlerIds(
  wrestlerIds: string[],
): Promise<string[]> {
  const { roster } = getRepositories();
  const checks = await Promise.all(
    wrestlerIds.map(async (wrestlerId) => {
      const wrestler = await roster.wrestlers.findById(wrestlerId);
      return wrestler ? wrestlerId : null;
    }),
  );
  return checks.filter((wrestlerId): wrestlerId is string => wrestlerId !== null);
}

/**
 * Reject when the same wrestler is picked for both slots on a single player.
 */
export function rejectDuplicateSlotAssignment(
  currentId: string | null | undefined,
  alternateId: string | null | undefined,
): APIGatewayProxyResult | null {
  if (currentId && alternateId && currentId === alternateId) {
    return badRequest(
      'currentWrestlerId and alternateWrestlerId cannot be the same wrestler',
    );
  }
  return null;
}
