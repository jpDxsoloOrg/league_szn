import { describe, it, expect, vi } from 'vitest';
import {
  NEEDS_WRESTLER,
  findHiddenPlayerIds,
  isNeedsWrestler,
  isPlayerVisible,
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

describe('findHiddenPlayerIds', () => {
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
