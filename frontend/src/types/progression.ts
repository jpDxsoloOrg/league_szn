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

/** PUT /progression/players/{playerId}/consideration body. */
export interface SetConsiderationInput {
  trackId: string;
  considering: boolean;
  /** Staff-only note, at most 500 characters. */
  note?: string;
}

/**
 * PUT /progression/players/{playerId}/consideration response. `changed` is
 * false when the request matched the stored state (no event, no notification).
 * `consideration` is the stored mark, or null when the player is not marked.
 */
export interface SetConsiderationResult {
  playerId: string;
  trackId: string;
  considering: boolean;
  changed: boolean;
  consideration: ProgressionConsideration | null;
}

/** GET /progression/considerations?kind= row, newest mark first. */
export interface ProgressionConsiderationEntry {
  playerId: string;
  name: string;
  wrestlerName: string;
  trackId: string;
  markedAt: string;
}

/** POST /progression/players/{playerId}/execute body. */
export interface ExecuteProgressionInput {
  trackId: string;
  /** Defaults to the track's toDivisionId; required when the track has none. */
  toDivisionId?: string;
  /** Publish a News announcement. */
  announce?: boolean;
  /** Proceed even if the player holds a title restricted to the old division. */
  force?: boolean;
}

export type ProgressionEventType = 'consideration_added' | 'consideration_removed' | 'executed';

export interface ProgressionEvent {
  eventId: string;
  playerId: string;
  trackId: string;
  kind: ProgressionKind;
  type: ProgressionEventType;
  fromDivisionId: string;
  toDivisionId?: string;
  actorUserId: string;
  createdAt: string;
}

/** POST /progression/players/{playerId}/execute 200 response. */
export interface ExecuteProgressionResult {
  playerId: string;
  trackId: string;
  kind: ProgressionKind;
  fromDivisionId: string;
  toDivisionId: string;
  divisionJoinedAt: string;
  /** The `executed` event. */
  event: ProgressionEvent;
  /** Set when `announce` was requested and the announcement was created. */
  announcementId?: string;
}

/** 409: the player is no longer in the track's source division. */
export interface NotInSourceDivisionError {
  code: 'NOT_IN_SOURCE_DIVISION';
  playerDivisionId: string | null;
  fromDivisionId: string;
}

/** 409: the player holds a title restricted to the old division. Retry with `force: true`. */
export interface HoldsDivisionTitleError {
  code: 'HOLDS_DIVISION_TITLE';
  championships: { championshipId: string; name: string }[];
}

/** 409: another request moved the player first. Reload and try again. */
export interface ConcurrentUpdateError {
  code: 'CONCURRENT_UPDATE';
}

/** 400: a call-up cannot target a developmental division. */
export interface TargetIsDevelopmentalError {
  code: 'TARGET_IS_DEVELOPMENTAL';
}

/** 400: the track is inactive. */
export interface TrackInactiveError {
  code: 'TRACK_INACTIVE';
}

/** Coded error bodies of POST /progression/players/{playerId}/execute (all also carry `message`). */
export type ExecuteProgressionError = (
  | NotInSourceDivisionError
  | HoldsDivisionTitleError
  | ConcurrentUpdateError
  | TargetIsDevelopmentalError
  | TrackInactiveError
) & { message: string };

/** POST /admin/progression/recompute body. Omit `playerIds` to recompute every player. */
export interface RecomputeProgressionInput {
  /** Non-empty when given. */
  playerIds?: string[];
}

export interface ProgressionRecomputeFailure {
  playerId: string;
  trackId?: string;
  message: string;
}

/** POST /admin/progression/recompute response. */
export interface RecomputeProgressionResult {
  playersProcessed: number;
  rowsUpdated: number;
  rowsDropped: number;
  failures: ProgressionRecomputeFailure[];
}
