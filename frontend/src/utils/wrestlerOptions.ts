import type { Wrestler, WrestlerPromotion } from '../types';

export type WrestlerSlotOptions = ReadonlyArray<{
  promotion: WrestlerPromotion;
  wrestlers: Wrestler[];
}>;

/**
 * Build `<optgroup>`s of wrestlers for a dropdown. The selected wrestler (if
 * any) is always included so the form renders its current pick even when that
 * wrestler is `isInUse=true`. Other in-use wrestlers are hidden to prevent
 * double-assignment.
 */
export function buildWrestlerOptionGroups(
  allWrestlers: Wrestler[],
  selectedWrestlerId: string | undefined,
  excludeWrestlerId: string | undefined,
): WrestlerSlotOptions {
  const visible = allWrestlers.filter((w) => {
    // Ghost roster rows (e.g. from a release against a deleted wrestlerId)
    // lack name/promotion — drop them rather than crash the sorts below.
    if (typeof w.name !== 'string' || typeof w.promotion !== 'string') return false;
    if (w.wrestlerId === excludeWrestlerId) return false; // never show the other-slot pick
    if (!w.isInUse) return true;
    return w.wrestlerId === selectedWrestlerId;
  });

  const byPromotion = new Map<WrestlerPromotion, Wrestler[]>();
  for (const w of visible) {
    const bucket = byPromotion.get(w.promotion) ?? [];
    bucket.push(w);
    byPromotion.set(w.promotion, bucket);
  }

  return Array.from(byPromotion.entries())
    .map(([promotion, wrestlers]) => ({
      promotion,
      wrestlers: wrestlers.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.promotion.localeCompare(b.promotion));
}
