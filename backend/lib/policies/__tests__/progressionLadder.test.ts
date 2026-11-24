import { describe, it, expect } from 'vitest';
import {
  computeMetric,
  computeProgress,
  isProtectedLoss,
  type ProgressionInputs,
  type ProgressionMatchInput,
  type ProgressionMatchResult,
} from '../progression';
import { buildDefaultLadderTrack } from '../../progression/defaultTracks';

const ASOF = '2026-06-30T00:00:00.000Z';

function match(day: number, result: ProgressionMatchResult, partial: Partial<ProgressionMatchInput> = {}): ProgressionMatchInput {
  const date = new Date(Date.UTC(2026, 5, day)).toISOString();
  return { matchId: `m${day}`, date, result, ...partial };
}

function inputs(matches: ProgressionMatchInput[], partial: Partial<ProgressionInputs> = {}): ProgressionInputs {
  return { playerId: 'p1', matches, promos: [], challenges: [], asOf: ASOF, ...partial };
}

const relegationTrack = buildDefaultLadderTrack({
  trackId: 'rel',
  kind: 'relegation',
  fromDivisionId: 'div-raw',
  divisionName: 'Raw',
  now: ASOF,
});

describe('lossPct', () => {
  it('is the share of losses on a 0-100 scale, null with no matches', () => {
    expect(computeMetric('lossPct', inputs([match(1, 'loss'), match(2, 'win'), match(3, 'loss'), match(4, 'draw')]))).toBe(50);
    expect(computeMetric('lossPct', inputs([]))).toBeNull();
  });

  it('with lastMatches looks only at the newest N and is null until N exist', () => {
    const matches = [match(1, 'win'), match(2, 'win'), match(3, 'loss'), match(4, 'loss')];
    expect(computeMetric('lossPct', inputs(matches), { lastMatches: 2 })).toBe(100);
    expect(computeMetric('lossPct', inputs(matches), { lastMatches: 5 })).toBeNull();
  });
});

describe('winPct with lastMatches', () => {
  it('uses the newest N matches only', () => {
    const matches = [match(1, 'loss'), match(2, 'loss'), match(3, 'win'), match(4, 'win')];
    expect(computeMetric('winPct', inputs(matches), { lastMatches: 2 })).toBe(100);
    expect(computeMetric('winPct', inputs(matches))).toBe(50);
  });
});

describe('currentLossStreak', () => {
  it('counts consecutive losses from the newest match back', () => {
    const matches = [match(1, 'loss'), match(2, 'win'), match(3, 'loss'), match(4, 'loss')];
    expect(computeMetric('currentLossStreak', inputs(matches))).toBe(2);
    expect(computeMetric('currentLossStreak', inputs([match(1, 'loss'), match(2, 'draw')]))).toBe(0);
  });
});

describe('daysSinceLastMatch', () => {
  it('counts whole days from the latest match to asOf', () => {
    expect(computeMetric('daysSinceLastMatch', inputs([match(1, 'win'), match(20, 'loss')]))).toBe(10);
  });

  it('counts from the window start when there is no match, else is null', () => {
    const since = '2026-05-31T00:00:00.000Z';
    expect(computeMetric('daysSinceLastMatch', inputs([]), {}, { mode: 'sinceJoinedDivision', since })).toBe(30);
    expect(computeMetric('daysSinceLastMatch', inputs([]))).toBeNull();
  });

  it('counts hot-angle matches as activity', () => {
    expect(computeMetric('daysSinceLastMatch', inputs([match(29, 'loss', { isHotAngle: true })]))).toBe(1);
  });
});

describe('avgStarRatingBelow', () => {
  it('is 5 minus the average rating and respects minRatedMatches', () => {
    const rated = [
      match(1, 'win', { ratingAverage: 2, ratingsCount: 3 }),
      match(2, 'loss', { ratingAverage: 1, ratingsCount: 2 }),
    ];
    expect(computeMetric('avgStarRatingBelow', inputs(rated))).toBe(3.5);
    expect(computeMetric('avgStarRatingBelow', inputs(rated), { minRatedMatches: 3 })).toBeNull();
  });
});

describe('contenderRankBest', () => {
  it('is the best (lowest) rank, null when unranked', () => {
    expect(computeMetric('contenderRankBest', inputs([], { contenderRanks: [4, 2, 7] }))).toBe(2);
    expect(computeMetric('contenderRankBest', inputs([]))).toBeNull();
  });

  it('pairs with atMost on promotion goals', () => {
    const promotion = buildDefaultLadderTrack({ trackId: 'pro', kind: 'promotion', fromDivisionId: 'd', divisionName: 'D', now: ASOF });
    const goal = (ranks: number[]) => computeProgress(promotion, inputs([], { contenderRanks: ranks })).goals
      .find((status) => status.goalId === 'contender-rank');
    expect(goal([3])?.met).toBe(true);
    expect(goal([5])?.met).toBe(false);
  });
});

describe('house rule: hot-angle losses never count towards relegation', () => {
  it('marks only losses in hot-angle matches as protected', () => {
    expect(isProtectedLoss(match(1, 'loss', { isHotAngle: true }))).toBe(true);
    expect(isProtectedLoss(match(1, 'win', { isHotAngle: true }))).toBe(false);
    expect(isProtectedLoss(match(1, 'loss'))).toBe(false);
  });

  it('skips hot-angle losses in lossPct', () => {
    const matches = [match(1, 'win'), match(2, 'loss', { isHotAngle: true }), match(3, 'loss', { isHotAngle: true })];
    expect(computeMetric('lossPct', inputs(matches))).toBe(0);
    // Wins in a hot angle still count; only the losses are protected.
    expect(computeMetric('lossPct', inputs([match(1, 'win', { isHotAngle: true }), match(2, 'loss')]))).toBe(50);
  });

  it('neither extends nor breaks a loss streak', () => {
    const extending = [match(1, 'win'), match(2, 'loss'), match(3, 'loss', { isHotAngle: true })];
    expect(computeMetric('currentLossStreak', inputs(extending))).toBe(1);
    const breaking = [match(1, 'loss'), match(2, 'loss', { isHotAngle: true }), match(3, 'loss')];
    expect(computeMetric('currentLossStreak', inputs(breaking))).toBe(2);
  });

  it('a losing streak inside a hot rivalry adds no relegation danger', () => {
    const before = [
      match(20, 'win', { ratingAverage: 3.5, ratingsCount: 2 }),
      match(21, 'loss', { ratingAverage: 3.5, ratingsCount: 2 }),
      match(22, 'win', { ratingAverage: 3.5, ratingsCount: 2 }),
    ];
    const hotLosses = [23, 24, 25, 26, 27, 28].map((day) => match(day, 'loss', { isHotAngle: true }));

    const dangerBefore = computeProgress(relegationTrack, inputs(before)).progressPct;
    const dangerAfter = computeProgress(relegationTrack, inputs([...before, ...hotLosses])).progressPct;
    expect(dangerAfter).toBeLessThanOrEqual(dangerBefore);

    // Control: the same losses outside a hot angle do raise the danger.
    const coldLosses = hotLosses.map((loss) => ({ ...loss, isHotAngle: false }));
    expect(computeProgress(relegationTrack, inputs([...before, ...coldLosses])).progressPct).toBeGreaterThan(dangerBefore);
  });
});

describe('currentWinlessStreak (PRL-03)', () => {
  it('counts losses and draws from the newest match back until a win', () => {
    const lossDrawLoss = [match(1, 'win'), match(2, 'loss'), match(3, 'draw'), match(4, 'loss')];
    expect(computeMetric('currentWinlessStreak', inputs(lossDrawLoss))).toBe(3);
    expect(computeMetric('currentWinlessStreak', inputs([...lossDrawLoss, match(5, 'win')]))).toBe(0);
    expect(computeMetric('currentWinlessStreak', inputs([]))).toBe(0);
  });

  it('fills a relegation goal proportionally', () => {
    const track = {
      ...relegationTrack,
      goals: [{ goalId: 'winless', metric: 'currentWinlessStreak' as const, threshold: 5, weight: 1 }],
    };
    const matches = [match(1, 'loss'), match(2, 'draw'), match(3, 'loss')];
    const result = computeProgress(track, inputs(matches));
    expect(result.goals[0]).toMatchObject({ current: 3, met: false });
    expect(result.progressPct).toBe(60);
  });
});

describe('losses (PRL-03)', () => {
  it('counts every loss in the window', () => {
    const matches = [match(1, 'loss'), match(2, 'win'), match(3, 'draw'), match(4, 'loss')];
    expect(computeMetric('losses', inputs(matches))).toBe(2);
    expect(computeMetric('losses', inputs([]))).toBe(0);
  });
});

describe('house rule: hot-angle losses in losses and currentWinlessStreak (PRL-03)', () => {
  it('L L L with two hot-angle losses counts as a single loss everywhere', () => {
    const matches = [match(1, 'loss', { isHotAngle: true }), match(2, 'loss'), match(3, 'loss', { isHotAngle: true })];
    expect(computeMetric('losses', inputs(matches))).toBe(1);
    expect(computeMetric('currentWinlessStreak', inputs(matches))).toBe(1);
    expect(computeMetric('currentLossStreak', inputs(matches))).toBe(1);
  });

  it('a hot-angle loss neither extends nor breaks a winless streak', () => {
    const breaking = [match(1, 'draw'), match(2, 'loss', { isHotAngle: true }), match(3, 'loss')];
    expect(computeMetric('currentWinlessStreak', inputs(breaking))).toBe(2);
    const afterWin = [match(1, 'win'), match(2, 'loss', { isHotAngle: true })];
    expect(computeMetric('currentWinlessStreak', inputs(afterWin))).toBe(0);
  });
});
