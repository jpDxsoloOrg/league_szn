import { describe, expect, it } from 'vitest';
import { DEFAULT_ECONOMY_SETTINGS } from '../../policies/economyDefaults';
import type { InjuryShieldEffect, PlayerEffect } from '../../repositories/types';
import {
  buildPlayerEffect,
  buildSimBoost,
  checkFunds,
  checkInjuryShield,
  checkItemForSale,
  checkRehab,
  checkSimInterference,
  isPurchasableItem,
  simBoostPurchaseKey,
  simBoostRefundKey,
} from '../effects';

const shop = structuredClone(DEFAULT_ECONOMY_SETTINGS.shop);
const meta = { effectId: 'e1', purchasedAt: '2026-11-24T00:00:00.000Z', purchaseKey: 'k1' };

const shield = (matchesLeft: number): InjuryShieldEffect => ({
  ...meta, kind: 'injuryShield', reduction: 0.5, matchesLeft,
});

describe('isPurchasableItem', () => {
  it('accepts the four direct items and refuses GM interference and junk', () => {
    expect(isPurchasableItem('injuryShield')).toBe(true);
    expect(isPurchasableItem('simInterference')).toBe(true);
    expect(isPurchasableItem('gmInterference')).toBe(false);
    expect(isPurchasableItem('nope')).toBe(false);
    expect(isPurchasableItem(3)).toBe(false);
  });
});

describe('checkItemForSale', () => {
  it('refuses a disabled item', () => {
    const disabled = { ...shop, rehab: { ...shop.rehab, enabled: false } };
    expect(checkItemForSale('rehab', disabled)?.code).toBe('ITEM_DISABLED');
  });

  it('refuses a zero price, which no ledger entry can carry', () => {
    const free = { ...shop, staminaTopUp: { ...shop.staminaTopUp, price: 0 } };
    expect(checkItemForSale('staminaTopUp', free)?.code).toBe('ITEM_DISABLED');
  });

  it('allows an enabled, priced item', () => {
    expect(checkItemForSale('injuryShield', shop)).toBeNull();
  });
});

describe('checkFunds', () => {
  it('locks the shop while in debt, even for a cheap item', () => {
    expect(checkFunds(-1, 0)?.code).toBe('IN_DEBT');
  });

  it('refuses a price above the balance', () => {
    expect(checkFunds(299, 300)?.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('allows spending the whole balance', () => {
    expect(checkFunds(300, 300)).toBeNull();
  });
});

describe('checkInjuryShield', () => {
  it('refuses a second shield while one has matches left', () => {
    expect(checkInjuryShield([shield(1)])?.code).toBe('SHIELD_ACTIVE');
  });

  it('allows a new shield once the old one is used up', () => {
    expect(checkInjuryShield([shield(0)])).toBeNull();
    expect(checkInjuryShield(undefined)).toBeNull();
  });

  it('ignores other effects', () => {
    const topUp: PlayerEffect = { ...meta, kind: 'staminaTopUp', amount: 20 };
    expect(checkInjuryShield([topUp])).toBeNull();
  });
});

describe('checkRehab', () => {
  it('needs an active injury', () => {
    expect(checkRehab(null)?.code).toBe('NO_ACTIVE_INJURY');
    expect(checkRehab(0)?.code).toBe('NO_ACTIVE_INJURY');
  });

  it('needs at least two weeks left', () => {
    expect(checkRehab(1)?.code).toBe('INJURY_TOO_SHORT');
    expect(checkRehab(2)).toBeNull();
  });
});

describe('checkSimInterference', () => {
  const match = { status: 'scheduled' as const, participants: ['p1', 'p2'], simBoosts: [] };

  it('allows a participant in a scheduled match', () => {
    expect(checkSimInterference(match, 'p1')).toBeNull();
  });

  it('refuses a match that is not scheduled', () => {
    expect(checkSimInterference({ ...match, status: 'completed' }, 'p1')?.code).toBe('MATCH_NOT_SCHEDULED');
    expect(checkSimInterference({ ...match, status: 'open-signups' }, 'p1')?.code).toBe('MATCH_NOT_SCHEDULED');
  });

  it("refuses someone else's match", () => {
    expect(checkSimInterference(match, 'p3')?.code).toBe('NOT_IN_MATCH');
  });

  it('refuses a second boost by the same player', () => {
    const boosted = { ...match, simBoosts: [buildSimBoost('p1', shop, meta)] };
    expect(checkSimInterference(boosted, 'p1')?.code).toBe('BOOST_ALREADY_BOUGHT');
    expect(checkSimInterference(boosted, 'p2')).toBeNull();
  });
});

describe('buildPlayerEffect', () => {
  it('copies the shield values from the settings', () => {
    expect(buildPlayerEffect('injuryShield', shop, meta)).toEqual({
      ...meta, kind: 'injuryShield', reduction: shop.injuryShield.chanceReduction, matchesLeft: shop.injuryShield.matches,
    });
  });

  it('records a pending rehab and stamina top-up', () => {
    expect(buildPlayerEffect('rehab', shop, meta)).toEqual({ ...meta, kind: 'rehab', weeksOff: 1 });
    expect(buildPlayerEffect('staminaTopUp', shop, meta)).toEqual({ ...meta, kind: 'staminaTopUp', amount: 20 });
  });
});

describe('keys', () => {
  it('derives one purchase key per player per match and its refund key', () => {
    const key = simBoostPurchaseKey('m1', 'p1');
    expect(key).toBe('shop#simInterference#m1#p1');
    expect(simBoostRefundKey(key)).toBe('shop#simInterference#m1#p1#refund');
  });
});
