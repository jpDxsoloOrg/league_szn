import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChampionshipHistoryEntry } from '../../repositories/types';

const { mockListAllHistory } = vi.hoisted(() => ({ mockListAllHistory: vi.fn() }));

vi.mock('../../repositories', () => ({
  getRepositories: () => ({
    competition: { championships: { listAllHistory: mockListAllHistory } },
  }),
}));

import { buildTitleReignIndex, loadTitleReignIndex } from '../titleReigns';

const closedReign: ChampionshipHistoryEntry = {
  championshipId: 'world',
  champion: 'alice',
  wonDate: '2026-01-10T20:00:00.000Z',
  lostDate: '2026-03-01T21:30:00.000Z',
};

describe('buildTitleReignIndex', () => {
  const isChampionAt = buildTitleReignIndex([closedReign]);

  it('credits the holder inside a reign', () => {
    expect(isChampionAt('alice', '2026-02-01T12:00:00.000Z')).toBe(true);
  });

  it('does not credit the holder before the reign starts', () => {
    expect(isChampionAt('alice', '2026-01-10T19:59:59.999Z')).toBe(false);
  });

  it('does not credit the holder from the moment the reign ends', () => {
    expect(isChampionAt('alice', '2026-03-01T21:30:00.000Z')).toBe(false);
    expect(isChampionAt('alice', '2026-04-01T00:00:00.000Z')).toBe(false);
  });

  it('starts a reign exactly at wonDate', () => {
    expect(isChampionAt('alice', '2026-01-10T20:00:00.000Z')).toBe(true);
  });

  it('keeps an open reign running', () => {
    const openIndex = buildTitleReignIndex([
      { champion: 'bob', wonDate: '2026-03-01T21:30:00.000Z' },
    ]);
    expect(openIndex('bob', '2030-01-01T00:00:00.000Z')).toBe(true);
    expect(openIndex('bob', '2026-02-28T00:00:00.000Z')).toBe(false);
  });

  it('credits every member of a tag reign', () => {
    const tagIndex = buildTitleReignIndex([
      { champion: ['carol', 'dave'], wonDate: '2026-02-01T00:00:00.000Z' },
    ]);
    expect(tagIndex('carol', '2026-02-02T00:00:00.000Z')).toBe(true);
    expect(tagIndex('dave', '2026-02-02T00:00:00.000Z')).toBe(true);
    expect(tagIndex('erin', '2026-02-02T00:00:00.000Z')).toBe(false);
  });

  it('treats the loser of the title match as champion going in, and the winner as not yet champion', () => {
    // Title match dated 2026-03-01T20:00; the result was recorded at 21:30,
    // which closes alice's reign and opens bob's.
    const index = buildTitleReignIndex([
      closedReign,
      { championshipId: 'world', champion: 'bob', wonDate: '2026-03-01T21:30:00.000Z' },
    ]);
    const titleMatchDate = '2026-03-01T20:00:00.000Z';
    expect(index('alice', titleMatchDate)).toBe(true);
    expect(index('bob', titleMatchDate)).toBe(false);
  });

  it('counts a date-only match on the change day as before the change', () => {
    const index = buildTitleReignIndex([
      closedReign,
      { championshipId: 'world', champion: 'bob', wonDate: '2026-03-01T21:30:00.000Z' },
    ]);
    expect(index('alice', '2026-03-01')).toBe(true);
    expect(index('bob', '2026-03-01')).toBe(false);
  });

  it('returns false for unknown players and unreadable dates', () => {
    expect(isChampionAt('nobody', '2026-02-01T00:00:00.000Z')).toBe(false);
    expect(isChampionAt('alice', 'not-a-date')).toBe(false);
    const skipped = buildTitleReignIndex([{ champion: 'zed', wonDate: 'garbage' }]);
    expect(skipped('zed', '2026-02-01T00:00:00.000Z')).toBe(false);
  });
});

describe('loadTitleReignIndex', () => {
  beforeEach(() => {
    mockListAllHistory.mockReset();
  });

  it('reads all reigns in one repository call', async () => {
    mockListAllHistory.mockResolvedValue([closedReign]);
    const isChampionAt = await loadTitleReignIndex();
    expect(mockListAllHistory).toHaveBeenCalledTimes(1);
    expect(isChampionAt('alice', '2026-02-01T00:00:00.000Z')).toBe(true);
  });
});
