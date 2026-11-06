import type { Promo, PromoType } from './repositories/types';

/** Call-outs and their responses leave public feeds this many days after posting. */
export const PROMO_ARCHIVE_DAYS = 4;

const PROMO_ARCHIVE_MS = PROMO_ARCHIVE_DAYS * 24 * 60 * 60 * 1000;
const ARCHIVABLE_PROMO_TYPES: ReadonlyArray<PromoType> = ['call-out', 'response'];

/**
 * True when a promo should be left out of public feeds because it has aged
 * out. Evaluated at read time from `createdAt`; nothing is written to the
 * promo. This is separate from `isHidden`, which is moderation state that
 * admin bulk-delete keys off. Archived promos stay reachable by direct link
 * and still count towards rivalry heat.
 */
export function isPromoArchived(
  promo: Pick<Promo, 'promoType' | 'createdAt' | 'isPinned'>,
  now: number = Date.now(),
): boolean {
  if (promo.isPinned || !ARCHIVABLE_PROMO_TYPES.includes(promo.promoType)) return false;
  return now - Date.parse(promo.createdAt) > PROMO_ARCHIVE_MS;
}
