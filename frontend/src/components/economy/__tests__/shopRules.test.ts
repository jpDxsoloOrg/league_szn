import { describe, it, expect } from 'vitest';
import type { Match } from '../../../types';
import type { PlayerEffect } from '../../../services/api/shop.api';
import { boostableMatches, formatMoney, shopBlockReason, type ShopContext } from '../shopItems';
import { activeNoShow, canMarkNoShow } from '../noShowRules';
import { splitFines } from '../economyDisplay';

const NONE = new Set<never>();

const context = (overrides: Partial<ShopContext> = {}): ShopContext => ({
  balance: 1000,
  price: 100,
  effects: [],
  boostableMatchCount: 1,
  hasPendingRequest: false,
  injuryWeeksLeft: null,
  pendingItems: NONE,
  ...overrides,
});

const shield = (matchesLeft: number): PlayerEffect => ({
  kind: 'injuryShield',
  effectId: 'e1',
  purchasedAt: '2026-11-01T00:00:00Z',
  purchaseKey: 'k',
  reduction: 0.5,
  matchesLeft,
});

const match = (overrides: Partial<Match>): Match => ({
  matchId: 'm1',
  date: '2026-12-01T20:00:00Z',
  matchFormat: 'singles',
  participants: ['me', 'them'],
  isChampionship: false,
  status: 'scheduled',
  createdAt: '2026-11-01T00:00:00Z',
  userHasRated: false,
  userRating: null,
  ...overrides,
});

describe('shopBlockReason', () => {
  it('lists items waiting on ECO-10 as coming soon by default', () => {
    expect(shopBlockReason('injuryShield', context({ pendingItems: undefined }))).toBe('comingSoon');
    expect(shopBlockReason('simInterference', context({ pendingItems: undefined }))).toBe('comingSoon');
    expect(shopBlockReason('gmInterference', context({ pendingItems: undefined }))).toBeNull();
  });

  it('locks every item while the player is in debt', () => {
    expect(shopBlockReason('gmInterference', context({ balance: -1 }))).toBe('inDebt');
    expect(shopBlockReason('staminaTopUp', context({ balance: -1, price: 0 }))).toBe('inDebt');
  });

  it('needs the price covered', () => {
    expect(shopBlockReason('staminaTopUp', context({ balance: 99 }))).toBe('insufficientFunds');
    expect(shopBlockReason('staminaTopUp', context({ balance: 100 }))).toBeNull();
  });

  it('allows one active shield at a time', () => {
    expect(shopBlockReason('injuryShield', context({ effects: [shield(2)] }))).toBe('shieldActive');
    expect(shopBlockReason('injuryShield', context({ effects: [shield(0)] }))).toBeNull();
  });

  it('needs an injury for rehab, a match for a boost and no open GM request', () => {
    expect(shopBlockReason('rehab', context())).toBe('noActiveInjury');
    expect(shopBlockReason('rehab', context({ injuryWeeksLeft: 3 }))).toBeNull();
    expect(shopBlockReason('simInterference', context({ boostableMatchCount: 0 }))).toBe('noScheduledMatch');
    expect(shopBlockReason('gmInterference', context({ hasPendingRequest: true }))).toBe('requestPending');
  });
});

describe('boostableMatches', () => {
  it('keeps scheduled matches the player is in and has not boosted, soonest first', () => {
    const matches = [
      match({ matchId: 'late', date: '2026-12-09T00:00:00Z' }),
      match({ matchId: 'early', date: '2026-12-02T00:00:00Z' }),
      match({ matchId: 'boosted', simBoosts: [{ playerId: 'me', boost: 5, purchasedAt: 'x' }] }),
      match({ matchId: 'theirs-boosted', simBoosts: [{ playerId: 'them', boost: 5, purchasedAt: 'x' }] }),
      match({ matchId: 'not-mine', participants: ['a', 'b'] }),
      match({ matchId: 'done', status: 'completed' }),
    ];
    expect(boostableMatches(matches, 'me').map((entry) => entry.matchId)).toEqual(['theirs-boosted', 'early', 'late']);
  });
});

describe('formatMoney', () => {
  it('puts the sign before the symbol', () => {
    expect(formatMoney(-50, '$', 'en-US')).toBe('-$50');
    expect(formatMoney(1200, '€', 'en-US')).toBe('€1,200');
  });
});

describe('no-show rules', () => {
  const now = new Date('2026-11-20T00:00:00Z');

  it('allows scheduled matches and completed ones for a week', () => {
    expect(canMarkNoShow({ status: 'scheduled' }, now)).toBe(true);
    expect(canMarkNoShow({ status: 'completed', completedAt: '2026-11-15T00:00:00Z' }, now)).toBe(true);
    expect(canMarkNoShow({ status: 'completed', completedAt: '2026-11-10T00:00:00Z' }, now)).toBe(false);
    expect(canMarkNoShow({ status: 'open-signups' }, now)).toBe(false);
  });

  it('finds only a mark that was not undone', () => {
    const marks = [
      { playerId: 'p1', markedAt: 'a', undoneAt: 'b' },
      { playerId: 'p2', markedAt: 'c' },
    ];
    expect(activeNoShow(marks, 'p1')).toBeNull();
    expect(activeNoShow(marks, 'p2')).toEqual({ playerId: 'p2', markedAt: 'c' });
  });
});

describe('splitFines', () => {
  it('pairs each rescind with its fine', () => {
    const base = { playerId: 'p', createdAt: 'x', balanceAfter: 0 };
    const { fines, rescinded } = splitFines([
      { ...base, entryId: 'r1', kind: 'fineRescinded', amount: 50, refType: 'ledgerEntry', refId: 'f1' },
      { ...base, entryId: 'f2', kind: 'fine', amount: -20 },
      { ...base, entryId: 'f1', kind: 'fine', amount: -50 },
      { ...base, entryId: 'pay', kind: 'perMatchPay', amount: 100 },
    ]);
    expect(fines.map((fine) => fine.entryId)).toEqual(['f2', 'f1']);
    expect([...rescinded]).toEqual(['f1']);
  });
});
