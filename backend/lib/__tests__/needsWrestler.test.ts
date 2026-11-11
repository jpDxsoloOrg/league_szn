import { describe, it, expect, vi } from 'vitest';
import {
  NEEDS_WRESTLER,
  findHiddenPlayerIds,
  isHiddenLivePlayer,
  isNeedsWrestler,
  isPlayerVisible,
  newPlayerName,
} from '../needsWrestler';

describe('isNeedsWrestler', () => {
  it.each([
    [null],
    [undefined],
    [''],
    ['   '],
    ['\t\n'],
    [NEEDS_WRESTLER],
    ['  needs wrestler  '],
    ['NEEDS WRESTLER'],
  ])('treats %j as no wrestler', (name) => {
    expect(isNeedsWrestler(name)).toBe(true);
  });

  it.each([['The Rock'], [' Kane '], ['Needs Wrestler Jr']])('treats %j as a real name', (name) => {
    expect(isNeedsWrestler(name)).toBe(false);
  });
});

describe('isPlayerVisible', () => {
  it('is true only with a real wrestler name', () => {
    expect(isPlayerVisible({ currentWrestler: 'The Rock' })).toBe(true);
    expect(isPlayerVisible({ currentWrestler: NEEDS_WRESTLER })).toBe(false);
    expect(isPlayerVisible({ currentWrestler: '   ' })).toBe(false);
    expect(isPlayerVisible({ currentWrestler: '' })).toBe(false);
    expect(isPlayerVisible({})).toBe(false);
  });
});

describe('isPlayerVisible with deactivation', () => {
  it('hides a deactivated player who has a real wrestler name', () => {
    expect(isPlayerVisible({ currentWrestler: 'Kane', deactivatedAt: '2026-01-01T00:00:00.000Z' })).toBe(false);
  });
});

describe('isHiddenLivePlayer', () => {
  it('counts a deactivated player, unless deleted', () => {
    const deactivatedAt = '2026-01-01T00:00:00.000Z';
    expect(isHiddenLivePlayer({ currentWrestler: 'Kane', deactivatedAt })).toBe(true);
    expect(isHiddenLivePlayer({ currentWrestler: 'Kane', deactivatedAt, deletedAt: '2026-02-01' })).toBe(false);
  });

  it('is true only for a live player without a wrestler', () => {
    expect(isHiddenLivePlayer({ currentWrestler: NEEDS_WRESTLER })).toBe(true);
    expect(isHiddenLivePlayer({ currentWrestler: 'Kane' })).toBe(false);
    expect(isHiddenLivePlayer({ currentWrestler: NEEDS_WRESTLER, deletedAt: '2026-01-01' })).toBe(false);
  });
});

describe('newPlayerName', () => {
  it.each([
    ['Real Name', 'Kane', 'Real Name'],
    ['   ', 'Kane', 'Kane'],
    [undefined, NEEDS_WRESTLER, 'Player abcd1234'],
    ['', '', 'Player abcd1234'],
    [null, null, 'Player abcd1234'],
  ])('resolves %j and %j to %j', (playerName, wrestlerName, expected) => {
    expect(newPlayerName(playerName, wrestlerName, 'abcd1234-5678')).toBe(expected);
  });
});

describe('findHiddenPlayerIds', () => {
  it('includes a deactivated player', async () => {
    const hidden = await findHiddenPlayerIds(['p1'], async () => ({
      currentWrestler: 'Kane',
      deactivatedAt: '2026-01-01T00:00:00.000Z',
    }));
    expect([...hidden]).toEqual(['p1']);
  });

  it('returns only existing hidden players and looks each ID up once', async () => {
    const records: Record<string, { currentWrestler: string } | null> = {
      real: { currentWrestler: 'The Rock' },
      hidden: { currentWrestler: NEEDS_WRESTLER },
      deleted: null,
    };
    const findById = vi.fn(async (id: string) => records[id]);

    const hidden = await findHiddenPlayerIds(['real', 'hidden', 'hidden', 'deleted'], findById);

    expect(Array.from(hidden)).toEqual(['hidden']);
    expect(findById).toHaveBeenCalledTimes(3);
  });
});
