import type { APIGatewayProxyResult } from 'aws-lambda';
import {
  bookingRefusal,
  computeDiscipline,
  isDeactivated,
  targetRefusal,
  type DisciplineFields,
} from './discipline';
import { refused } from './response';

/** Delete would erase the trail, so it waits until the status is clear (owner decision 15). */
export function deleteRefusal(player: DisciplineFields, now: Date = new Date()): APIGatewayProxyResult | null {
  const { status } = computeDiscipline(player, now);
  if (status === 'clear') return null;
  if (status === 'deactivated') {
    return refused(409, 'PLAYER_DEACTIVATED', 'This player is deactivated. Reactivate them before deleting.');
  }
  return refused(409, 'DISCIPLINE_ACTIVE', 'This player has active strikes and cannot be deleted yet');
}

/**
 * The player joining a team or faction. Forming a team is not signing up, so a
 * sign-up block passes (owner decision 12) and only deactivation refuses.
 */
export function teamMemberRefusal(player: DisciplineFields): APIGatewayProxyResult | null {
  return isDeactivated(player) ? targetRefusal(player) : null;
}

/** The first refusal among players being added. Ids that found no row are skipped. */
export function firstBookingRefusal(
  players: ReadonlyArray<(DisciplineFields & { name?: string }) | null>,
): APIGatewayProxyResult | null {
  for (const player of players) {
    const refusal = player && bookingRefusal(player);
    if (refusal) return refusal;
  }
  return null;
}

/** Booking refusals apply only to players an edit adds, never to those already there. */
export function newlyAddedIds(nextIds: readonly string[], existingIds: readonly string[]): string[] {
  const existing = new Set(existingIds);
  return Array.from(new Set(nextIds)).filter((id) => !existing.has(id));
}

/** `currentChampion` holds one id, several, or nothing. */
export function championIdsOf(currentChampion: unknown): string[] {
  const ids = Array.isArray(currentChampion) ? currentChampion : [currentChampion];
  return ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/** A deactivated player's gamertag leaves match cards, which otherwise stay as history. */
export function bookablePsnId(player: (DisciplineFields & { psnId?: string }) | null | undefined): string | undefined {
  return player && !isDeactivated(player) ? player.psnId : undefined;
}
