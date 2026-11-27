import type { Promo } from './repositories/types';

/** Promos of every type leave public feeds this many days after posting. */
export const PROMO_ARCHIVE_DAYS = 4;

const PROMO_ARCHIVE_MS = PROMO_ARCHIVE_DAYS * 24 * 60 * 60 * 1000;

/**
 * True when a promo should be left out of public feeds because it has aged
 * out. Evaluated at read time from `createdAt`; nothing is written to the
 * promo. This is separate from `isHidden`, which is moderation state that
 * admin bulk-delete keys off. Archived promos stay reachable by direct link
 * and still count towards rivalry heat.
 */
export function isPromoArchived(
  promo: Pick<Promo, 'createdAt' | 'isPinned'>,
  now: number = Date.now(),
): boolean {
  if (promo.isPinned) return false;
  return now - Date.parse(promo.createdAt) > PROMO_ARCHIVE_MS;
}
