import type { ProgressionGoal, ProgressionTrack } from '../repositories/types';

/** Name of the default Young Boys call-up track (CUP-04). */
export const DEFAULT_CALLUP_TRACK_NAME = 'Young Boys Call-Up';

/**
 * Goals of the default call-up track, equally weighted:
 *   - 10 matches competed
 *   - average of at least 3.0 stars over at least 5 rated matches
 *   - 3 promos with at least 3 reactions each
 *   - 5 wins
 * Goal ids are fixed so re-seeding keeps them stable.
 */
export const DEFAULT_CALLUP_GOALS: readonly ProgressionGoal[] = [
  { goalId: 'matches-competed', metric: 'matchesCompeted', threshold: 10, weight: 1 },
  {
    goalId: 'avg-star-rating',
    metric: 'avgStarRating',
    threshold: 3,
    weight: 1,
    params: { minRatedMatches: 5 },
  },
  {
    goalId: 'promos-with-reactions',
    metric: 'promosWithReactions',
    threshold: 3,
    weight: 1,
    params: { minReactions: 3 },
  },
  { goalId: 'wins', metric: 'wins', threshold: 5, weight: 1 },
];

export interface DefaultCallupTrackInput {
  trackId: string;
  /** The developmental (Young Boys) division the track promotes out of. */
  fromDivisionId: string;
  /** ISO timestamp used for createdAt and updatedAt. */
  now: string;
}

/**
 * The default call-up track for the developmental division. `toDivisionId`
 * is left unset: the GM picks the destination when executing a call-up.
 */
export function buildDefaultCallupTrack(input: DefaultCallupTrackInput): ProgressionTrack {
  return {
    trackId: input.trackId,
    kind: 'callup',
    name: DEFAULT_CALLUP_TRACK_NAME,
    fromDivisionId: input.fromDivisionId,
    goals: DEFAULT_CALLUP_GOALS.map((goal) => ({
      ...goal,
      ...(goal.params ? { params: { ...goal.params } } : {}),
    })),
    windowMode: 'sinceJoinedDivision',
    isActive: true,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

// ─── Promotion / relegation templates (DMV-02) ──────────────────────

export const DEFAULT_PROMOTION_TRACK_SUFFIX = 'Promotion';
export const DEFAULT_RELEGATION_TRACK_SUFFIX = 'Relegation';

/** Matches the win/loss rate goals look back over. */
export const DEFAULT_LADDER_FORM_MATCHES = 8;

/**
 * Default promotion goals, equally weighted:
 *   - 60% win rate over the last 8 matches
 *   - average of at least 3.25 stars
 *   - top-3 contender for any title of the division (best rank <= 3)
 *   - 1 Match of the Night
 */
export const DEFAULT_PROMOTION_GOALS: readonly ProgressionGoal[] = [
  {
    goalId: 'win-pct',
    metric: 'winPct',
    threshold: 60,
    weight: 1,
    params: { lastMatches: DEFAULT_LADDER_FORM_MATCHES },
  },
  { goalId: 'avg-star-rating', metric: 'avgStarRating', threshold: 3.25, weight: 1 },
  { goalId: 'contender-rank', metric: 'contenderRankBest', threshold: 3, weight: 1, direction: 'atMost' },
  { goalId: 'match-of-the-night', metric: 'matchOfTheNight', threshold: 1, weight: 1 },
];

/**
 * Default relegation ("danger") goals, equally weighted. Progress on this
 * track is how close the player is to relegation.
 *   - loss rate of 70% or more over the last 8 matches (hot-angle losses skipped)
 *   - 30+ days without a match
 *   - average of 2.0 stars or less over at least 5 rated matches, expressed
 *     as `avgStarRatingBelow` (5 - average) >= 3
 */
export const DEFAULT_RELEGATION_GOALS: readonly ProgressionGoal[] = [
  {
    goalId: 'loss-pct',
    metric: 'lossPct',
    threshold: 70,
    weight: 1,
    params: { lastMatches: DEFAULT_LADDER_FORM_MATCHES },
  },
  { goalId: 'inactivity', metric: 'daysSinceLastMatch', threshold: 30, weight: 1 },
  {
    goalId: 'low-star-rating',
    metric: 'avgStarRatingBelow',
    threshold: 3,
    weight: 1,
    params: { minRatedMatches: 5 },
  },
];

export type LadderKind = 'promotion' | 'relegation';

export interface DefaultLadderTrackInput {
  trackId: string;
  kind: LadderKind;
  fromDivisionId: string;
  /** Used in the track name, e.g. "Raw Promotion". */
  divisionName: string;
  /** ISO timestamp used for createdAt and updatedAt. */
  now: string;
}

/**
 * A default promotion or relegation track for a tiered division, editable
 * by the GM like any other track. `toDivisionId` is left unset: the
 * destination is resolved from the tiers when the move is executed.
 */
export function buildDefaultLadderTrack(input: DefaultLadderTrackInput): ProgressionTrack {
  const isPromotion = input.kind === 'promotion';
  const goals = isPromotion ? DEFAULT_PROMOTION_GOALS : DEFAULT_RELEGATION_GOALS;
  const suffix = isPromotion ? DEFAULT_PROMOTION_TRACK_SUFFIX : DEFAULT_RELEGATION_TRACK_SUFFIX;
  return {
    trackId: input.trackId,
    kind: input.kind,
    // 100 = MAX_TRACK_NAME_LENGTH in functions/progression/trackInput.ts.
    name: `${input.divisionName} ${suffix}`.trim().slice(0, 100),
    fromDivisionId: input.fromDivisionId,
    goals: goals.map((goal) => ({
      ...goal,
      ...(goal.params ? { params: { ...goal.params } } : {}),
    })),
    windowMode: 'sinceJoinedDivision',
    isActive: true,
    createdAt: input.now,
    updatedAt: input.now,
  };
}
