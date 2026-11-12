import { describe, it, expect } from 'vitest';
import { applyOverrides, type ActiveOverride } from '../overrideApplicator';
import type { RankingResult } from '../rankingCalculator';

function row(playerId: string, rank: number): RankingResult {
  return {
    playerId, rank, rankingScore: 100 - rank, winPercentage: 50, currentStreak: 1,
    qualityScore: 40, recencyScore: 30, matchesInPeriod: 5, winsInPeriod: 3,
  };
}

const organicList = (count: number) => Array.from({ length: count }, (_, i) => row(`p${i + 1}`, i + 1));
const bump = (playerId: string, createdAt = '2026-01-01'): ActiveOverride => ({ playerId, overrideType: 'bump_to_top', createdAt });
const send = (playerId: string, createdAt = '2026-01-01'): ActiveOverride => ({ playerId, overrideType: 'send_to_bottom', createdAt });
const ids = (rows: Array<{ playerId: string }>) => rows.map((r) => r.playerId);

describe('applyOverrides', () => {
  describe('with tag-team rows', () => {
    const teamRow = (tagTeamId: string, rank: number): RankingResult => ({
      ...row(tagTeamId, rank), entityType: 'tagTeam', tagTeamId,
    });
    const teamList = [teamRow('t1', 1), teamRow('t2', 2), teamRow('t3', 3)];

    it('moves a team row for a tag-team override', () => {
      const result = applyOverrides(teamList, [{ ...bump('t3'), entityType: 'tagTeam' }], 3);

      expect(ids(result)).toEqual(['t3', 't1', 't2']);
      expect(result[0]).toMatchObject({ entityType: 'tagTeam', isOverridden: true, organicRank: 3 });
    });

    it('never matches a player override to a team row with the same id', () => {
      const result = applyOverrides(teamList, [bump('t3'), send('t1')], 3);

      expect(ids(result)).toEqual(['t1', 't2', 't3']);
      expect(result.some((r) => r.isOverridden)).toBe(false);
    });

    it('never matches a tag-team override to a player row', () => {
      const result = applyOverrides(organicList(3), [{ ...bump('p3'), entityType: 'tagTeam' }], 3);

      expect(ids(result)).toEqual(['p1', 'p2', 'p3']);
    });
  });

  it('numbers the list when there are no overrides', () => {
    expect(applyOverrides(organicList(2), []).map((r) => r.rank)).toEqual([1, 2]);
  });

  it('puts a bumped player from outside the list at #1 and drops the lowest organic row', () => {
    const outsider = { ...row('out', 0), rankingScore: 0, matchesInPeriod: 0 };
    const result = applyOverrides([...organicList(10), outsider], [bump('out')], 10);

    expect(result).toHaveLength(10);
    expect(result[0]).toMatchObject({ playerId: 'out', rank: 1, isOverridden: true, overrideType: 'bump_to_top' });
    expect(result[0].organicRank).toBeUndefined();
    expect(ids(result)).not.toContain('p10');
    expect(result[9]).toMatchObject({ playerId: 'p9', rank: 10 });
  });

  it('keeps the true organic rank of a bumped player who scored outside the top N', () => {
    const result = applyOverrides([...organicList(10), row('p14', 14)], [bump('p14')], 10);
    expect(result[0]).toMatchObject({ playerId: 'p14', organicRank: 14 });
  });

  it('does not drop anyone when the bumped player was already on the list', () => {
    const result = applyOverrides(organicList(10), [bump('p7')], 10);
    expect(result).toHaveLength(10);
    expect(ids(result)).toContain('p10');
    expect(result[0]).toMatchObject({ playerId: 'p7', organicRank: 7 });
  });

  it('sends a listed player last, even when the list has to shrink for a bump', () => {
    const result = applyOverrides([...organicList(10), row('out', 0)], [bump('out'), send('p1')], 10);

    expect(result).toHaveLength(10);
    expect(result[0].playerId).toBe('out');
    expect(result[9]).toMatchObject({ playerId: 'p1', rank: 10, isOverridden: true, overrideType: 'send_to_bottom' });
    expect(ids(result)).not.toContain('p10');
  });

  it('leaves the list alone for a player sent to the bottom who is not on it', () => {
    const result = applyOverrides(organicList(3), [send('nobody')], 10);
    expect(ids(result)).toEqual(['p1', 'p2', 'p3']);
    expect(result.some((r) => r.isOverridden)).toBe(false);
  });

  it('skips a bump with no row, which is how an ineligible player arrives', () => {
    const result = applyOverrides(organicList(3), [bump('champion')], 10);
    expect(ids(result)).toEqual(['p1', 'p2', 'p3']);
  });

  it('orders several overrides by age whatever order they were read in', () => {
    const overrides = [
      send('p2', '2026-02-02'),
      bump('p4', '2026-03-03'),
      send('p1', '2026-02-01'),
      bump('p5', '2026-03-04'),
    ];
    const expected = ['p5', 'p4', 'p3', 'p1', 'p2'];

    expect(ids(applyOverrides(organicList(5), overrides, 10))).toEqual(expected);
    expect(ids(applyOverrides(organicList(5), [...overrides].reverse(), 10))).toEqual(expected);
  });

  it('keeps the newest overrides when they alone exceed the limit', () => {
    const overrides = [
      bump('p1', '2026-01-01'),
      bump('p2', '2026-01-02'),
      bump('p3', '2026-01-03'),
      send('p4', '2026-01-04'),
    ];
    expect(ids(applyOverrides(organicList(5), overrides, 2))).toEqual(['p3', 'p2']);
    expect(ids(applyOverrides(organicList(5), overrides, 4))).toEqual(['p3', 'p2', 'p1', 'p4']);
  });

  it('ignores an override type it does not know', () => {
    const unknown = { playerId: 'p1', overrideType: 'hold_position' } as unknown as ActiveOverride;
    const result = applyOverrides(organicList(3), [unknown], 10);
    expect(ids(result)).toEqual(['p1', 'p2', 'p3']);
    expect(result[0].isOverridden).toBeUndefined();
  });

  it('does not mutate its inputs', () => {
    const rankings = organicList(3);
    const overrides = [send('p1', '2026-01-02'), send('p2', '2026-01-01')];
    applyOverrides(rankings, overrides, 10);
    expect(ids(rankings)).toEqual(['p1', 'p2', 'p3']);
    expect(ids(overrides)).toEqual(['p1', 'p2']);
    expect(rankings[0]).not.toHaveProperty('isOverridden');
  });
});
