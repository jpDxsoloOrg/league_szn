import { describe, it, expect } from 'vitest';
import { isPlayerActive, hasActiveOverride, filterActivePlayers } from '../activeStatus';

const override = (seasonId: string, value: boolean) => ({
  seasonId,
  value,
  setBy: 'admin',
  setAt: '2026-01-01T00:00:00.000Z',
});

describe('isPlayerActive', () => {
  it('is active when the last completed match was in the active season', () => {
    expect(isPlayerActive({ lastActiveSeasonId: 's1' }, 's1')).toBe(true);
  });

  it('is inactive when the last completed match was in a previous season', () => {
    expect(isPlayerActive({ lastActiveSeasonId: 's0' }, 's1')).toBe(false);
  });

  it('is inactive when the player has never completed a match', () => {
    expect(isPlayerActive({}, 's1')).toBe(false);
  });

  it('lets an override force a player active', () => {
    expect(isPlayerActive({ activeOverride: override('s1', true) }, 's1')).toBe(true);
  });

  it('lets an override force a player inactive despite a match this season', () => {
    expect(
      isPlayerActive({ lastActiveSeasonId: 's1', activeOverride: override('s1', false) }, 's1'),
    ).toBe(false);
  });

  it('ignores an override left over from a previous season', () => {
    expect(isPlayerActive({ activeOverride: override('s0', true) }, 's1')).toBe(false);
    expect(
      isPlayerActive({ lastActiveSeasonId: 's1', activeOverride: override('s0', false) }, 's1'),
    ).toBe(true);
  });

  it('treats a cleared override as no override', () => {
    expect(isPlayerActive({ lastActiveSeasonId: 's1', activeOverride: null }, 's1')).toBe(true);
  });

  it('is inactive when there is no active season', () => {
    expect(isPlayerActive({ lastActiveSeasonId: 's1' }, undefined)).toBe(false);
    expect(isPlayerActive({ activeOverride: override('s1', true) }, undefined)).toBe(false);
  });
});

describe('hasActiveOverride', () => {
  it('is true only for an override stamped with the active season', () => {
    expect(hasActiveOverride({ activeOverride: override('s1', false) }, 's1')).toBe(true);
    expect(hasActiveOverride({ activeOverride: override('s0', false) }, 's1')).toBe(false);
    expect(hasActiveOverride({}, 's1')).toBe(false);
    expect(hasActiveOverride({ activeOverride: override('s1', true) }, undefined)).toBe(false);
  });
});

describe('filterActivePlayers', () => {
  it('keeps only active players', () => {
    const players = [
      { playerId: 'p1', lastActiveSeasonId: 's1' },
      { playerId: 'p2', lastActiveSeasonId: 's0' },
      { playerId: 'p3', activeOverride: override('s1', true) },
    ];

    expect(filterActivePlayers(players, 's1').map((p) => p.playerId)).toEqual(['p1', 'p3']);
  });
});
