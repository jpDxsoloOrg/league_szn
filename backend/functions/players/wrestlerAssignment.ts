import { APIGatewayProxyResult } from 'aws-lambda';
import { badRequest, conflict, notFound } from '../../lib/response';
import { getRepositories } from '../../lib/repositories';
import type { Wrestler } from '../../lib/repositories/types';

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
  const wrestler = await getRepositories().roster.wrestlers.findById(wrestlerId);
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
  }
  return { wrestler };
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
