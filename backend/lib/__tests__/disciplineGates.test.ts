import { describe, it, expect } from 'vitest';
import type { PlayerStrike } from '../repositories/types';
import {
  bookablePsnId,
  championIdsOf,
  deleteRefusal,
  firstBookingRefusal,
  newlyAddedIds,
  teamMemberRefusal,
} from '../disciplineGates';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-06-15T12:00:00.000Z');

const strike = (dayOffset: number): PlayerStrike => ({
  strikeId: `strike-${dayOffset}`,
  issuedAt: new Date(NOW.getTime() + dayOffset * DAY_MS).toISOString(),
  issuedBy: 'admin',
  issuedByName: 'Admin',
  reason: 'Missed the show',
});

const bodyOf = (result: { body: string } | null) => JSON.parse(result?.body ?? '{}') as { code?: string };

describe('deleteRefusal', () => {
  it('passes a clear player, including lapsed strikes', () => {
    expect(deleteRefusal({}, NOW)).toBeNull();
    expect(deleteRefusal({ strikes: [strike(-8)] }, NOW)).toBeNull();
  });

  it.each([
    ['warned', [strike(-1)]],
    ['signup-blocked', [strike(-3), strike(-1)]],
    ['cooldown', [strike(-10), strike(-8)]],
  ])('refuses %s with DISCIPLINE_ACTIVE', (_status, strikes) => {
    const refusal = deleteRefusal({ strikes }, NOW);
    expect(refusal?.statusCode).toBe(409);
    expect(bodyOf(refusal).code).toBe('DISCIPLINE_ACTIVE');
  });

  it('refuses deactivated with PLAYER_DEACTIVATED', () => {
    const refusal = deleteRefusal({ deactivatedAt: NOW.toISOString() }, NOW);
    expect(refusal?.statusCode).toBe(409);
    expect(bodyOf(refusal).code).toBe('PLAYER_DEACTIVATED');
  });
});

describe('teamMemberRefusal', () => {
  it('passes a sign-up block and refuses deactivation neutrally', () => {
    expect(teamMemberRefusal({ strikes: [strike(-3), strike(-1)] })).toBeNull();
    const refusal = teamMemberRefusal({ deactivatedAt: NOW.toISOString() });
    expect(refusal?.statusCode).toBe(409);
    expect(bodyOf(refusal).code).toBe('PLAYER_UNAVAILABLE');
  });
});

describe('firstBookingRefusal', () => {
  it('skips missing rows and passes when nobody is deactivated', () => {
    expect(firstBookingRefusal([null, {}, { strikes: [strike(-3), strike(-1)] }])).toBeNull();
  });

  it('refuses on any deactivated player', () => {
    expect(bodyOf(firstBookingRefusal([{}, { deactivatedAt: NOW.toISOString() }])).code).toBe('PLAYER_DEACTIVATED');
  });
});

describe('newlyAddedIds', () => {
  it('keeps only ids not already there, once each', () => {
    expect(newlyAddedIds(['a', 'b', 'b', 'c'], ['a'])).toEqual(['b', 'c']);
  });
});

describe('championIdsOf', () => {
  it('reads one id, several, or nothing', () => {
    expect(championIdsOf('p1')).toEqual(['p1']);
    expect(championIdsOf(['p1', 'p2'])).toEqual(['p1', 'p2']);
    expect(championIdsOf(null)).toEqual([]);
    expect(championIdsOf(undefined)).toEqual([]);
    expect(championIdsOf('')).toEqual([]);
  });
});

describe('bookablePsnId', () => {
  it('masks only a deactivated player', () => {
    expect(bookablePsnId({ psnId: 'gamer' })).toBe('gamer');
    expect(bookablePsnId({ psnId: 'gamer', deactivatedAt: NOW.toISOString() })).toBeUndefined();
    expect(bookablePsnId(undefined)).toBeUndefined();
  });
});
