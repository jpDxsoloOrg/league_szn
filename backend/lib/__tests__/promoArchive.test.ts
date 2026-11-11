import { describe, it, expect } from 'vitest';
import { PROMO_ARCHIVE_DAYS, isPromoArchived } from '../promoArchive';
import type { PromoType } from '../repositories/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-06-15T12:00:00.000Z');

const postedAgo = (ageMs: number): string => new Date(NOW - ageMs).toISOString();
const windowMs = PROMO_ARCHIVE_DAYS * DAY_MS;
const promo = (promoType: PromoType, createdAt: string, isPinned = false) => ({
  promoType,
  createdAt,
  isPinned,
});

describe('isPromoArchived', () => {
  it('uses a four day window', () => {
    expect(PROMO_ARCHIVE_DAYS).toBe(4);
  });

  it.each(['call-out', 'response'] as const)('archives a %s just over the window', (promoType) => {
    expect(isPromoArchived(promo(promoType, postedAgo(windowMs + 1000)), NOW)).toBe(true);
  });

  it.each(['call-out', 'response'] as const)('keeps a %s just under the window', (promoType) => {
    expect(isPromoArchived(promo(promoType, postedAgo(windowMs - 1000)), NOW)).toBe(false);
  });

  it('keeps a promo that is exactly at the window', () => {
    expect(isPromoArchived(promo('call-out', postedAgo(windowMs)), NOW)).toBe(false);
  });

  it('never archives a pinned promo', () => {
    expect(isPromoArchived(promo('call-out', postedAgo(windowMs * 10), true), NOW)).toBe(false);
  });

  it.each(['open-mic', 'rivalry', 'pre-match', 'post-match', 'championship', 'return'] as const)(
    'never archives a %s promo',
    (promoType) => {
      expect(isPromoArchived(promo(promoType, postedAgo(windowMs * 10)), NOW)).toBe(false);
    },
  );

  it('leaves a promo with an unreadable date in the feed', () => {
    expect(isPromoArchived(promo('call-out', ''), NOW)).toBe(false);
  });
});
