import type { EventCheckInRoster } from '../types/event';

/**
 * Check-in standing for one player on a given event. Mirrors the roster
 * buckets returned by GET /events/{eventId}/check-ins, plus 'noResponse'
 * for players who never answered.
 */
export type CheckInStatus =
  | 'available'
  | 'tentative'
  | 'unavailable'
  | 'noResponse';

/** The people who actually said they can wrestle — shown first when booking. */
export const BOOKABLE_STATUSES: readonly CheckInStatus[] = [
  'available',
  'tentative',
];

/** Render order wherever players are grouped by check-in status. */
export const CHECK_IN_STATUS_ORDER: readonly CheckInStatus[] = [
  'available',
  'tentative',
  'noResponse',
  'unavailable',
];

export function isBookable(status: CheckInStatus): boolean {
  return BOOKABLE_STATUSES.includes(status);
}

/**
 * Flatten the roster buckets into one playerId -> status lookup. Players with
 * no check-in row stay out of the map; callers treat a miss as 'noResponse'.
 */
export function buildCheckInStatusMap(
  roster: EventCheckInRoster | null | undefined,
): Map<string, CheckInStatus> {
  const map = new Map<string, CheckInStatus>();
  if (!roster) return map;
  const buckets: CheckInStatus[] = [
    'available',
    'tentative',
    'unavailable',
    'noResponse',
  ];
  for (const bucket of buckets) {
    for (const player of roster[bucket]) {
      map.set(player.playerId, bucket);
    }
  }
  return map;
}
