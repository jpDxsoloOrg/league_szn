import type { Player, PlayerBookingInfo } from '../types';

/** Booked this long ago (or never) counts as "fresh" — worth surfacing. */
export const FRESH_AFTER_DAYS = 14;

/**
 * Sort order inside a check-in bucket: never booked first, then oldest
 * booking first, most recent last; name breaks ties. Without booking info
 * it degrades to the old name-only order.
 */
export function compareByBookingRecency(
  a: Player,
  b: Player,
  info?: ReadonlyMap<string, PlayerBookingInfo>,
): number {
  if (info) {
    const aAt = info.get(a.playerId)?.lastBookedAt ?? null;
    const bAt = info.get(b.playerId)?.lastBookedAt ?? null;
    if (aAt === null && bAt !== null) return -1;
    if (aAt !== null && bAt === null) return 1;
    if (aAt !== null && bAt !== null && aAt !== bAt) return aAt < bAt ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
}

export function isFreshBooking(lastBookedAt: string | null | undefined, now = new Date()): boolean {
  if (!lastBookedAt) return true;
  const then = new Date(lastBookedAt).getTime();
  if (Number.isNaN(then)) return false;
  return now.getTime() - then >= FRESH_AFTER_DAYS * 86400000;
}

/** "Aug 29" / "Aug 29, 2025" when it's a different year. */
export function formatShortDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}
