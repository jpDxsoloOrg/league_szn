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
