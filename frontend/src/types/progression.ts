// Progression (Young Boys call-ups, division promotion / relegation).
// Mirrors backend/lib/repositories/types.ts and the /progression endpoints.

export type ProgressionKind = 'callup' | 'promotion' | 'relegation';

export type ProgressionMetric =
  | 'matchesCompeted'
  | 'wins'
  | 'winPct'
  | 'avgStarRating'
  | 'promosCut'
  | 'promosWithReactions'
  | 'totalPromoReactions'
  | 'matchOfTheNight'
  | 'challengesIssued'
  | 'currentWinStreak';

export type ProgressionWindowMode = 'allTime' | 'season' | 'sinceJoinedDivision';

export type ProgressionGoalDirection = 'atLeast' | 'atMost';

export interface ProgressionGoalParams {
  /** avgStarRating: minimum number of rated matches before the metric counts. */
  minRatedMatches?: number;
  /** promosWithReactions: minimum reactions (from other users) a promo needs to count. */
  minReactions?: number;
}

export interface ProgressionGoal {
  goalId: string;
  metric: ProgressionMetric;
  threshold: number;
  weight: number;
  /** Defaults to 'atLeast'. */
  direction?: ProgressionGoalDirection;
  params?: ProgressionGoalParams;
  labelKey?: string;
}

export interface ProgressionTrack {
  trackId: string;
  kind: ProgressionKind;
  name: string;
  fromDivisionId: string;
  toDivisionId?: string;
  goals: ProgressionGoal[];
  windowMode: ProgressionWindowMode;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A goal in a create/update body. `goalId` is generated when omitted; `weight` defaults to 1. */
export type ProgressionGoalInput = Omit<ProgressionGoal, 'goalId' | 'weight'> & {
  goalId?: string;
  weight?: number;
};

/** POST /progression/tracks body. windowMode defaults to sinceJoinedDivision, isActive to true. */
export interface CreateProgressionTrackInput {
  kind: ProgressionKind;
  name: string;
  fromDivisionId: string;
  toDivisionId?: string;
  goals: ProgressionGoalInput[];
  windowMode?: ProgressionWindowMode;
  isActive?: boolean;
}

/** PUT /progression/tracks/{trackId} body: partial; `goals` replaces the list; `toDivisionId: null` clears it. */
export type UpdateProgressionTrackInput = Partial<Omit<CreateProgressionTrackInput, 'toDivisionId'>> & {
  toDivisionId?: string | null;
};

export interface ProgressionTrackFilter {
  kind?: ProgressionKind;
  isActive?: boolean;
  fromDivisionId?: string;
}

export interface ProgressionConsideration {
  status: 'considering';
  markedBy: string;
  markedAt: string;
  note?: string;
}

/** A track goal joined with the player's current value. */
export interface ProgressionGoalDetail {
  goalId: string;
  metric: ProgressionMetric;
  threshold: number;
  weight: number;
  direction: ProgressionGoalDirection;
  params?: ProgressionGoalParams;
  labelKey?: string;
  /** null while the metric is not yet computable (e.g. too few rated matches). */
  current: number | null;
  met: boolean;
}

/**
 * One row of GET /progression/players/{playerId}. `goals` is present for the
 * player themselves and Moderator+; `considerationDetail` for Moderator+ only.
 */
export interface PlayerProgressionSummary {
  trackId: string;
  kind: ProgressionKind;
  trackName: string;
  /** 0-100 */
  progressPct: number;
  consideration: boolean;
  computedAt: string;
  goals?: ProgressionGoalDetail[];
  considerationDetail?: ProgressionConsideration;
}

export interface ProgressionBoardEntry {
  playerId: string;
  name: string;
  wrestlerName: string;
  imageUrl?: string;
  progressPct: number;
  goals: ProgressionGoalDetail[];
  consideration?: ProgressionConsideration;
  computedAt: string;
}

/** GET /progression/tracks/{trackId}/players */
export interface ProgressionBoard {
  track: ProgressionTrack;
  players: ProgressionBoardEntry[];
}

/** Stored per-player row, as returned by the consideration endpoint. */
export interface PlayerProgressionGoalStatus {
  goalId: string;
  current: number | null;
  threshold: number;
  met: boolean;
}

export interface PlayerProgression {
  playerId: string;
  trackId: string;
  progressPct: number;
  goals: PlayerProgressionGoalStatus[];
  consideration?: ProgressionConsideration;
  computedAt: string;
}

/** PUT /progression/players/{playerId}/consideration body. */
export interface SetConsiderationInput {
  trackId: string;
  considering: boolean;
  note?: string;
}

/** GET /progression/considerations?kind= row. */
export interface ProgressionConsiderationEntry {
  playerId: string;
  name: string;
  wrestlerName: string;
  markedAt: string;
}

/** POST /progression/players/{playerId}/execute body. */
export interface ExecuteProgressionInput {
  trackId: string;
  /** Required when the track has no toDivisionId. */
  toDivisionId?: string;
  announce?: boolean;
  force?: boolean;
}

/** POST /admin/progression/recompute body: specific players, or `all`. */
export interface RecomputeProgressionInput {
  playerIds?: string[];
  all?: boolean;
}
