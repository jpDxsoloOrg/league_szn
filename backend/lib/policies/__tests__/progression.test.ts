import { describe, it, expect } from 'vitest';
import {
  ALL_TIME_WINDOW,
  DEFAULT_MIN_RATED_MATCHES,
  DEFAULT_MIN_REACTIONS,
  MIN_RATINGS_PER_MATCH,
  ProgressionPolicyError,
  applyWindow,
  computeMetric,
  computeProgress,
  goalFill,
  goalMet,
  validateGoal,
  type ProgressionInputs,
  type ProgressionMatchInput,
  type ProgressionMatchResult,
  type ProgressionPromoInput,
} from '../progression';
import type { ProgressionGoal, ProgressionTrack } from '../../repositories/types';

let matchSeq = 0;
const match = (
  result: ProgressionMatchResult,
  date: string,
  extra: Partial<ProgressionMatchInput> = {},
): ProgressionMatchInput => ({ matchId: `m${++matchSeq}`, date, result, ...extra });

const promo = (createdAt: string, reactionCounts: ProgressionPromoInput['reactionCounts'] = {}): ProgressionPromoInput => ({
  promoId: `p-${createdAt}`,
  createdAt,
  reactionCounts,
});

const inputs = (partial: Partial<ProgressionInputs> = {}): ProgressionInputs => ({
  playerId: 'player-1',
  matches: [],
  promos: [],
  challenges: [],
  ...partial,
});

const goal = (partial: Partial<ProgressionGoal> = {}): ProgressionGoal => ({
  goalId: 'g1',
  metric: 'wins',
  threshold: 5,
  weight: 1,
  ...partial,
});

const track = (goals: ProgressionGoal[], windowMode: ProgressionTrack['windowMode'] = 'allTime'): ProgressionTrack => ({
  trackId: 't1',
  kind: 'callup',
  name: 'Young Boys',
  fromDivisionId: 'div-yb',
  toDivisionId: 'div-main',
  goals,
  windowMode,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const D1 = '2026-01-01T00:00:00.000Z';
const D2 = '2026-02-01T00:00:00.000Z';
const D3 = '2026-03-01T00:00:00.000Z';
const D4 = '2026-04-01T00:00:00.000Z';

describe('tunables', () => {
  it('defaults to 1 rating per match, 1 rated match, 1 reaction', () => {
    expect(MIN_RATINGS_PER_MATCH).toBe(1);
    expect(DEFAULT_MIN_RATED_MATCHES).toBe(1);
    expect(DEFAULT_MIN_REACTIONS).toBe(1);
  });
});

describe('computeMetric', () => {
  const sample = inputs({
    matches: [
      match('win', D1, { ratingAverage: 4, ratingsCount: 3, matchOfTheNight: true }),
      match('loss', D2, { ratingAverage: 2, ratingsCount: 1 }),
      match('draw', D3),
      match('win', D4, { matchOfTheNight: false }),
    ],
    promos: [promo(D1, { fire: 2, clap: 1 }), promo(D2), promo(D3, { mic: 1 })],
    challenges: [
      { challengeId: 'c1', createdAt: D1 },
      { challengeId: 'c2', createdAt: D2 },
    ],
  });

  it('matchesCompeted counts every completed match', () => {
    expect(computeMetric('matchesCompeted', sample)).toBe(4);
  });

  it('wins counts only wins', () => {
    expect(computeMetric('wins', sample)).toBe(2);
  });

  it('winPct is wins over all matches on a 0–100 scale (draws count as played)', () => {
    expect(computeMetric('winPct', sample)).toBe(50);
  });

  it('winPct is null with no matches', () => {
    expect(computeMetric('winPct', inputs())).toBeNull();
  });

  it('avgStarRating averages rated matches only', () => {
    expect(computeMetric('avgStarRating', sample)).toBe(3);
  });

  it('avgStarRating skips matches below MIN_RATINGS_PER_MATCH and ones with no average', () => {
    const data = inputs({
      matches: [
        match('win', D1, { ratingAverage: 5, ratingsCount: 0 }),
        match('win', D2, { ratingAverage: 1 }),
        match('win', D3, { ratingsCount: 4 }),
        match('win', D4, { ratingAverage: 3.5, ratingsCount: 2 }),
      ],
    });
    expect(computeMetric('avgStarRating', data)).toBe(3.5);
  });

  it('avgStarRating is null below minRatedMatches', () => {
    expect(computeMetric('avgStarRating', sample, { minRatedMatches: 3 })).toBeNull();
    expect(computeMetric('avgStarRating', sample, { minRatedMatches: 2 })).toBe(3);
  });

  it('avgStarRating is null with no rated matches even when minRatedMatches is 0', () => {
    expect(computeMetric('avgStarRating', inputs(), { minRatedMatches: 0 })).toBeNull();
  });

  it('promosCut counts promos', () => {
    expect(computeMetric('promosCut', sample)).toBe(3);
  });

  it('promosWithReactions counts promos whose reaction total reaches minReactions', () => {
    expect(computeMetric('promosWithReactions', sample)).toBe(2);
    expect(computeMetric('promosWithReactions', sample, { minReactions: 3 })).toBe(1);
    expect(computeMetric('promosWithReactions', sample, { minReactions: 4 })).toBe(0);
  });

  it('totalPromoReactions sums every reaction (tolerating missing counts)', () => {
    const data = inputs({ promos: [...sample.promos, promo(D4, { trash: undefined })] });
    expect(computeMetric('totalPromoReactions', data)).toBe(4);
  });

  it('matchOfTheNight counts flagged matches', () => {
    expect(computeMetric('matchOfTheNight', sample)).toBe(1);
  });

  it('challengesIssued counts challenges', () => {
    expect(computeMetric('challengesIssued', sample)).toBe(2);
  });

  it('currentWinStreak counts trailing wins by date, not input order', () => {
    const data = inputs({
      matches: [match('win', D4), match('loss', D1), match('win', D3), match('win', D2)],
    });
    expect(computeMetric('currentWinStreak', data)).toBe(3);
  });

  it('currentWinStreak is broken by a draw and is 0 after a loss', () => {
    expect(computeMetric('currentWinStreak', inputs({ matches: [match('win', D1), match('draw', D2), match('win', D3)] }))).toBe(1);
    expect(computeMetric('currentWinStreak', inputs({ matches: [match('win', D1), match('loss', D2)] }))).toBe(0);
    expect(computeMetric('currentWinStreak', inputs())).toBe(0);
  });

  it('applies the window it is given', () => {
    expect(computeMetric('matchesCompeted', sample, {}, { mode: 'sinceJoinedDivision', since: D3 })).toBe(2);
  });
});

describe('applyWindow', () => {
  const data = inputs({
    matches: [
      match('win', D1, { seasonId: 's1' }),
      match('win', D2, { seasonId: 's2' }),
      match('loss', D3, { seasonId: 's2' }),
      match('win', 'not-a-date', { seasonId: 's2' }),
    ],
    promos: [promo(D1), promo(D2), promo(D3), promo('garbage')],
    challenges: [
      { challengeId: 'c1', createdAt: D1 },
      { challengeId: 'c2', createdAt: D4 },
    ],
  });

  it('allTime returns everything untouched', () => {
    expect(applyWindow(data, ALL_TIME_WINDOW)).toBe(data);
  });

  it('season keeps matches by seasonId from `since` on and promos/challenges inside the season dates', () => {
    const result = applyWindow(data, { mode: 'season', seasonId: 's2', since: D2, until: D3 });
    expect(result.matches.map((m) => m.date)).toEqual([D2, D3]);
    expect(result.promos.map((p) => p.createdAt)).toEqual([D2, D3]);
    expect(result.challenges).toEqual([]);
  });

  it('season without dates only bounds matches', () => {
    const result = applyWindow(data, { mode: 'season', seasonId: 's1' });
    expect(result.matches).toHaveLength(1);
    expect(result.promos).toHaveLength(3);
    expect(result.challenges).toHaveLength(2);
  });

  it('season with no active season is empty', () => {
    const result = applyWindow(data, { mode: 'season' });
    expect(result).toEqual({ playerId: 'player-1', matches: [], promos: [], challenges: [] });
  });

  it('sinceJoinedDivision keeps items on or after the join date', () => {
    const result = applyWindow(data, { mode: 'sinceJoinedDivision', since: D2 });
    expect(result.matches.map((m) => m.date)).toEqual([D2, D3]);
    expect(result.promos.map((p) => p.createdAt)).toEqual([D2, D3]);
    expect(result.challenges.map((c) => c.challengeId)).toEqual(['c2']);
  });

  it('sinceJoinedDivision without a join date only drops unparseable dates', () => {
    const result = applyWindow(data, { mode: 'sinceJoinedDivision' });
    expect(result.matches).toHaveLength(3);
    expect(result.promos).toHaveLength(3);
  });

  describe('places matches by completion time (PRL-02)', () => {
    const bookedEarlyRecordedLate = match('win', D1, { completedAt: D3 });
    const bookedLateRecordedEarly = match('win', D3, { completedAt: D1 });
    const legacyNoCompletedAt = match('win', D3);
    const windowed = applyWindow(
      inputs({ matches: [bookedEarlyRecordedLate, bookedLateRecordedEarly, legacyNoCompletedAt] }),
      { mode: 'sinceJoinedDivision', since: D2 },
    );
    const keptIds = windowed.matches.map((m) => m.matchId);

    it('counts a match booked before the epoch but completed after it', () => {
      expect(keptIds).toContain(bookedEarlyRecordedLate.matchId);
    });

    it('drops a match booked after the epoch but completed before it', () => {
      expect(keptIds).not.toContain(bookedLateRecordedEarly.matchId);
    });

    it('falls back to the booked date when completedAt is missing', () => {
      expect(keptIds).toContain(legacyNoCompletedAt.matchId);
    });

    it('applies the upper bound to the completion time too', () => {
      const bounded = applyWindow(
        inputs({ matches: [bookedEarlyRecordedLate, match('win', D3, { completedAt: D2 })] }),
        { mode: 'sinceJoinedDivision', since: D1, until: D2 },
      );
      expect(bounded.matches.map((m) => m.completedAt)).toEqual([D2]);
    });
  });
});

describe('progression epoch clips every window (PRL-01)', () => {
  const EPOCH = '2026-03-01T00:00:00.000Z';
  const day = (dayOfMonth: number, month = '02'): string =>
    `2026-${month}-${String(dayOfMonth).padStart(2, '0')}T00:00:00.000Z`;
  const beforeEpoch = (dayOfMonth: number): string => day(dayOfMonth, '02');
  const afterEpoch = (dayOfMonth: number): string => day(dayOfMonth, '03');
  const allTimeSinceEpoch = { mode: 'allTime' as const, since: EPOCH };

  it('5 wins before the epoch and none after count as 0 wins and no win streak', () => {
    const data = inputs({ matches: [1, 2, 3, 4, 5].map((dayOfMonth) => match('win', beforeEpoch(dayOfMonth))) });
    expect(computeMetric('wins', data, {}, allTimeSinceEpoch)).toBe(0);
    expect(computeMetric('currentWinStreak', data, {}, allTimeSinceEpoch)).toBe(0);
  });

  it('a win streak does not carry across the epoch', () => {
    const data = inputs({
      matches: [
        match('win', beforeEpoch(1)),
        match('win', beforeEpoch(2)),
        match('win', beforeEpoch(3)),
        match('win', afterEpoch(2)),
        match('win', afterEpoch(3)),
      ],
    });
    expect(computeMetric('currentWinStreak', data, {}, allTimeSinceEpoch)).toBe(2);
  });

  it('loss and winless streaks are cut at a division move too', () => {
    const data = inputs({
      matches: [
        match('loss', beforeEpoch(1)),
        match('draw', beforeEpoch(2)),
        match('loss', beforeEpoch(3)),
        match('loss', afterEpoch(2)),
        match('draw', afterEpoch(3)),
        match('loss', afterEpoch(4)),
      ],
    });
    const sinceMove = { mode: 'sinceJoinedDivision' as const, since: EPOCH };
    expect(computeMetric('currentLossStreak', data, {}, sinceMove)).toBe(1);
    expect(computeMetric('currentWinlessStreak', data, {}, sinceMove)).toBe(3);
    expect(computeMetric('currentWinlessStreak', data, {}, allTimeSinceEpoch)).toBe(3);
    expect(computeMetric('losses', data, {}, allTimeSinceEpoch)).toBe(2);
    // Without the epoch the whole history would count.
    expect(computeMetric('currentWinlessStreak', data, {}, ALL_TIME_WINDOW)).toBe(6);
  });

  it('season track: a season that started before the epoch only counts post-epoch matches', () => {
    const data = inputs({
      matches: [
        match('win', beforeEpoch(10), { seasonId: 's1' }),
        match('win', afterEpoch(10), { seasonId: 's1' }),
        match('win', afterEpoch(11), { seasonId: 'other' }),
      ],
    });
    const window = { mode: 'season' as const, seasonId: 's1', since: EPOCH };
    expect(computeMetric('wins', data, {}, window)).toBe(1);
  });

  it('season track: when the epoch is earlier than the season start, the season start wins', () => {
    // resolveProgressionWindow passes the later bound (the season start) as `since`.
    const seasonStart = afterEpoch(15);
    const data = inputs({
      matches: [
        match('win', afterEpoch(5), { seasonId: 's1' }),
        match('win', afterEpoch(20), { seasonId: 's1' }),
      ],
      promos: [promo(afterEpoch(5)), promo(afterEpoch(20))],
    });
    const window = { mode: 'season' as const, seasonId: 's1', since: seasonStart };
    expect(computeMetric('wins', data, {}, window)).toBe(1);
    expect(computeMetric('promosCut', data, {}, window)).toBe(1);
  });

  it('excludes promos and challenges from before the epoch', () => {
    const data = inputs({
      promos: [promo(beforeEpoch(1), { fire: 3 }), promo(afterEpoch(1), { fire: 2 })],
      challenges: [
        { challengeId: 'old', createdAt: beforeEpoch(1) },
        { challengeId: 'new', createdAt: afterEpoch(1) },
      ],
    });
    expect(computeMetric('promosCut', data, {}, allTimeSinceEpoch)).toBe(1);
    expect(computeMetric('totalPromoReactions', data, {}, allTimeSinceEpoch)).toBe(2);
    expect(computeMetric('challengesIssued', data, {}, allTimeSinceEpoch)).toBe(1);
  });

  it('counts a match recorded exactly at the epoch (inclusive bound)', () => {
    const data = inputs({
      matches: [match('win', beforeEpoch(1), { completedAt: EPOCH }), match('win', beforeEpoch(2))],
    });
    expect(computeMetric('wins', data, {}, allTimeSinceEpoch)).toBe(1);
  });
});

describe('goal helpers', () => {
  it('atLeast fill is current/threshold capped at 1', () => {
    expect(goalFill(goal({ threshold: 4 }), 2)).toBe(0.5);
    expect(goalFill(goal({ threshold: 4 }), 10)).toBe(1);
    expect(goalMet(goal({ threshold: 4 }), 4)).toBe(true);
    expect(goalMet(goal({ threshold: 4 }), 3)).toBe(false);
  });

  it('atMost fill is 1 under the ceiling and shrinks above it', () => {
    const ceiling = goal({ direction: 'atMost', threshold: 30 });
    expect(goalFill(ceiling, 10)).toBe(1);
    expect(goalFill(ceiling, 60)).toBe(0.5);
    expect(goalMet(ceiling, 30)).toBe(true);
    expect(goalMet(ceiling, 31)).toBe(false);
  });

  it('a null metric fills 0 and is never met', () => {
    expect(goalFill(goal(), null)).toBe(0);
    expect(goalMet(goal(), null)).toBe(false);
    expect(goalMet(goal({ direction: 'atMost' }), null)).toBe(false);
  });

  it('rejects zero, negative or non-finite thresholds and weights', () => {
    expect(() => validateGoal(goal({ threshold: 0 }))).toThrow(ProgressionPolicyError);
    expect(() => validateGoal(goal({ threshold: -1 }))).toThrow(/threshold/);
    expect(() => validateGoal(goal({ threshold: Number.NaN }))).toThrow(/threshold/);
    expect(() => validateGoal(goal({ weight: 0 }))).toThrow(/weight/);
    expect(() => validateGoal(goal({ weight: Number.POSITIVE_INFINITY }))).toThrow(/weight/);
    expect(() => validateGoal(goal())).not.toThrow();
  });
});

describe('computeProgress', () => {
  const data = inputs({
    matches: [match('win', D1), match('win', D2), match('loss', D3)],
    promos: [promo(D1, { fire: 1 })],
  });

  it('returns per-goal status and a weighted overall percentage', () => {
    const result = computeProgress(
      track([
        goal({ goalId: 'wins', metric: 'wins', threshold: 4, weight: 3 }),
        goal({ goalId: 'promos', metric: 'promosCut', threshold: 1, weight: 1 }),
      ]),
      data,
    );
    expect(result.goals).toEqual([
      { goalId: 'wins', current: 2, threshold: 4, met: false },
      { goalId: 'promos', current: 1, threshold: 1, met: true },
    ]);
    // (0.5 * 3 + 1 * 1) / 4 = 0.625
    expect(result.progressPct).toBe(62.5);
  });

  it('normalises weights that do not sum to 1', () => {
    const goals = (scale: number) => [
      goal({ goalId: 'a', metric: 'wins', threshold: 4, weight: 1 * scale }),
      goal({ goalId: 'b', metric: 'matchesCompeted', threshold: 3, weight: 1 * scale }),
    ];
    const small = computeProgress(track(goals(0.25)), data);
    const large = computeProgress(track(goals(10)), data);
    expect(small.progressPct).toBe(75);
    expect(large.progressPct).toBe(75);
  });

  it('rounds progressPct to one decimal', () => {
    const result = computeProgress(track([goal({ metric: 'wins', threshold: 3 })]), data);
    expect(result.progressPct).toBe(66.7);
  });

  it('rejects a zero-threshold goal', () => {
    expect(() => computeProgress(track([goal({ threshold: 0 })]), data)).toThrow(ProgressionPolicyError);
  });

  it('avg rating below the minimum rated matches gives null and 0 fill', () => {
    const rated = inputs({ matches: [match('win', D1, { ratingAverage: 5, ratingsCount: 2 })] });
    const result = computeProgress(
      track([goal({ metric: 'avgStarRating', threshold: 3, params: { minRatedMatches: 2 } })]),
      rated,
    );
    expect(result.goals[0]).toEqual({ goalId: 'g1', current: null, threshold: 3, met: false });
    expect(result.progressPct).toBe(0);
  });

  it('supports an atMost goal (relegation)', () => {
    const relegation = track([goal({ metric: 'winPct', direction: 'atMost', threshold: 50 })]);
    expect(computeProgress(relegation, data).goals[0].met).toBe(false);
    // 66.67% win rate against a 50% ceiling → fill 0.75
    expect(computeProgress(relegation, data).progressPct).toBe(75);
    const losing = inputs({ matches: [match('loss', D1), match('loss', D2)] });
    expect(computeProgress(relegation, losing)).toEqual({
      progressPct: 100,
      goals: [{ goalId: 'g1', current: 0, threshold: 50, met: true }],
    });
  });

  it('uses the track window mode with the caller context', () => {
    const seasonal = inputs({
      matches: [match('win', D1, { seasonId: 'old' }), match('win', D2, { seasonId: 'now' })],
    });
    const seasonTrack = track([goal({ metric: 'wins', threshold: 2 })], 'season');
    expect(computeProgress(seasonTrack, seasonal, { seasonId: 'now' }).progressPct).toBe(50);
    expect(computeProgress(seasonTrack, seasonal).progressPct).toBe(0);

    const joinTrack = track([goal({ metric: 'wins', threshold: 2 })], 'sinceJoinedDivision');
    expect(computeProgress(joinTrack, seasonal, { since: D2 }).goals[0].current).toBe(1);
  });

  it('a track with no goals is 0%', () => {
    expect(computeProgress(track([]), data)).toEqual({ progressPct: 0, goals: [] });
  });
});
