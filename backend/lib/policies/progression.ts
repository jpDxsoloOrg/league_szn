/**
 * Progression policy (CUP-02).
 *
 * Pure, side-effect-free math that turns a player's raw activity (completed
 * matches, promos, challenges) into per-goal progress and an overall
 * percentage for a `ProgressionTrack` (call-ups, promotions, relegations).
 * Data loading lives in `lib/progression/loadInputs.ts`; this module does
 * no I/O. Tunables are exported constants, mirroring `rivalryHeat.ts`.
 *
 * Goal fill:
 *   - 'atLeast' (default): fill = min(current / threshold, 1), met = current >= threshold.
 *   - 'atMost' (relegation): fill = 1 while current <= threshold, otherwise
 *     threshold / current (shrinks the further past the ceiling the player is);
 *     met = current <= threshold.
 *   - A metric that is not yet computable (`current === null`) fills 0 and is
 *     never met, whatever the direction.
 *
 * Overall progress is the weighted mean of goal fills, scaled to 0–100.
 * Weights do not need to sum to 1: they are normalised by their total.
 */

import type {
  PlayerProgressionGoalStatus,
  ProgressionGoal,
  ProgressionGoalParams,
  ProgressionMetric,
  ProgressionTrack,
  ProgressionWindowMode,
  ReactionType,
} from '../repositories/types';

// ─── Tunables ───────────────────────────────────────────────────────

/** A match needs at least this many user ratings to count towards `avgStarRating`. */
export const MIN_RATINGS_PER_MATCH = 1;

/** Default `params.minRatedMatches` for `avgStarRating`. */
export const DEFAULT_MIN_RATED_MATCHES = 1;

/** Default `params.minReactions` for `promosWithReactions`. */
export const DEFAULT_MIN_REACTIONS = 1;

/** `progressPct` is rounded to this many decimal places. */
export const PROGRESS_PCT_DECIMALS = 1;

// ─── Inputs ─────────────────────────────────────────────────────────

export type ProgressionMatchResult = 'win' | 'loss' | 'draw';

/** One completed match the player took part in, from that player's point of view. */
export interface ProgressionMatchInput {
  matchId: string;
  /** ISO date of the match; used for window filtering and win-streak order. */
  date: string;
  seasonId?: string;
  result: ProgressionMatchResult;
  /** Raw (un-rounded) mean of user ratings. */
  ratingAverage?: number;
  ratingsCount?: number;
  matchOfTheNight?: boolean;
}

/** One promo the player authored. */
export interface ProgressionPromoInput {
  promoId: string;
  createdAt: string;
  /** Reaction counts from OTHER users only (the loader strips self-reactions). */
  reactionCounts: Partial<Record<ReactionType, number>>;
}

/** One challenge the player issued (they are the challenger). */
export interface ProgressionChallengeInput {
  challengeId: string;
  createdAt: string;
}

export interface ProgressionInputs {
  playerId: string;
  matches: ProgressionMatchInput[];
  promos: ProgressionPromoInput[];
  challenges: ProgressionChallengeInput[];
}

/**
 * The time window a metric is measured over.
 *
 * - `allTime`: everything.
 * - `season`: matches whose `seasonId` equals `seasonId`; promos and
 *   challenges created within [`since`, `until`] (the season's start/end).
 *   With no `seasonId` (no active season) the window is empty.
 * - `sinceJoinedDivision`: everything dated on or after `since` (the
 *   division join date). With no `since` there is no lower bound.
 */
export interface ProgressionWindow {
  mode: ProgressionWindowMode;
  seasonId?: string;
  /** Inclusive ISO lower bound. */
  since?: string;
  /** Inclusive ISO upper bound (season end). */
  until?: string;
}

/** The parts of a window the caller supplies; the mode comes from the track. */
export type ProgressionWindowContext = Omit<ProgressionWindow, 'mode'>;

export const ALL_TIME_WINDOW: ProgressionWindow = { mode: 'allTime' };

export interface ProgressionResult {
  /** 0–100 */
  progressPct: number;
  goals: PlayerProgressionGoalStatus[];
}

export class ProgressionPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProgressionPolicyError';
  }
}

// ─── Window filtering ───────────────────────────────────────────────

function withinBounds(timestamp: string, window: ProgressionWindow): boolean {
  const time = Date.parse(timestamp);
  if (Number.isNaN(time)) return false;
  if (window.since !== undefined && time < Date.parse(window.since)) return false;
  if (window.until !== undefined && time > Date.parse(window.until)) return false;
  return true;
}

/** Returns the subset of `inputs` that falls inside `window`. */
export function applyWindow(inputs: ProgressionInputs, window: ProgressionWindow): ProgressionInputs {
  if (window.mode === 'allTime') return inputs;

  if (window.mode === 'season') {
    const { seasonId } = window;
    if (seasonId === undefined) {
      return { playerId: inputs.playerId, matches: [], promos: [], challenges: [] };
    }
    return {
      playerId: inputs.playerId,
      matches: inputs.matches.filter((match) => match.seasonId === seasonId),
      promos: inputs.promos.filter((promo) => withinBounds(promo.createdAt, window)),
      challenges: inputs.challenges.filter((challenge) => withinBounds(challenge.createdAt, window)),
    };
  }

  return {
    playerId: inputs.playerId,
    matches: inputs.matches.filter((match) => withinBounds(match.date, window)),
    promos: inputs.promos.filter((promo) => withinBounds(promo.createdAt, window)),
    challenges: inputs.challenges.filter((challenge) => withinBounds(challenge.createdAt, window)),
  };
}

// ─── Metrics ────────────────────────────────────────────────────────

function sumReactions(promo: ProgressionPromoInput): number {
  return Object.values(promo.reactionCounts).reduce<number>((total, count) => total + (count ?? 0), 0);
}

function averageStarRating(matches: ProgressionMatchInput[], minRatedMatches: number): number | null {
  const ratings: number[] = [];
  for (const match of matches) {
    if (match.ratingAverage !== undefined && (match.ratingsCount ?? 0) >= MIN_RATINGS_PER_MATCH) {
      ratings.push(match.ratingAverage);
    }
  }
  if (ratings.length === 0 || ratings.length < minRatedMatches) return null;
  return ratings.reduce((total, rating) => total + rating, 0) / ratings.length;
}

function currentWinStreak(matches: ProgressionMatchInput[]): number {
  const newestFirst = [...matches].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  let streak = 0;
  for (const match of newestFirst) {
    if (match.result !== 'win') break;
    streak += 1;
  }
  return streak;
}

/**
 * Computes one metric over `inputs` restricted to `window`.
 *
 * Returns `null` when the metric is not yet computable:
 *   - `avgStarRating` with fewer than `params.minRatedMatches` rated matches;
 *   - `winPct` with no matches.
 * `winPct` is on a 0–100 scale; `avgStarRating` on the 0.5–5 star scale.
 */
export function computeMetric(
  metric: ProgressionMetric,
  inputs: ProgressionInputs,
  params: ProgressionGoalParams = {},
  window: ProgressionWindow = ALL_TIME_WINDOW,
): number | null {
  const { matches, promos, challenges } = applyWindow(inputs, window);

  switch (metric) {
    case 'matchesCompeted':
      return matches.length;
    case 'wins':
      return matches.filter((match) => match.result === 'win').length;
    case 'winPct': {
      if (matches.length === 0) return null;
      const wins = matches.filter((match) => match.result === 'win').length;
      return (wins / matches.length) * 100;
    }
    case 'avgStarRating':
      return averageStarRating(matches, params.minRatedMatches ?? DEFAULT_MIN_RATED_MATCHES);
    case 'promosCut':
      return promos.length;
    case 'promosWithReactions': {
      const minReactions = params.minReactions ?? DEFAULT_MIN_REACTIONS;
      return promos.filter((promo) => sumReactions(promo) >= minReactions).length;
    }
    case 'totalPromoReactions':
      return promos.reduce((total, promo) => total + sumReactions(promo), 0);
    case 'matchOfTheNight':
      return matches.filter((match) => match.matchOfTheNight === true).length;
    case 'challengesIssued':
      return challenges.length;
    case 'currentWinStreak':
      return currentWinStreak(matches);
  }
}

// ─── Goals and overall progress ─────────────────────────────────────

/**
 * Throws `ProgressionPolicyError` if a goal can't be scored: the threshold
 * and weight must be finite numbers above zero. Endpoints that save tracks
 * can call this to reject bad input up front.
 */
export function validateGoal(goal: ProgressionGoal): void {
  if (!Number.isFinite(goal.threshold) || goal.threshold <= 0) {
    throw new ProgressionPolicyError(`Goal ${goal.goalId}: threshold must be greater than 0`);
  }
  if (!Number.isFinite(goal.weight) || goal.weight <= 0) {
    throw new ProgressionPolicyError(`Goal ${goal.goalId}: weight must be greater than 0`);
  }
}

/** Fill in [0, 1] for one goal. */
export function goalFill(goal: ProgressionGoal, current: number | null): number {
  if (current === null) return 0;
  if (goal.direction === 'atMost') {
    return current <= goal.threshold ? 1 : goal.threshold / current;
  }
  return Math.min(current / goal.threshold, 1);
}

/** Whether `current` satisfies the goal. A null metric never does. */
export function goalMet(goal: ProgressionGoal, current: number | null): boolean {
  if (current === null) return false;
  return goal.direction === 'atMost' ? current <= goal.threshold : current >= goal.threshold;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Scores every goal on `track` for one player. The window mode comes from
 * `track.windowMode`; `context` supplies the season id / join date it needs.
 * The result can be written straight into `PlayerProgression`.
 */
export function computeProgress(
  track: ProgressionTrack,
  inputs: ProgressionInputs,
  context: ProgressionWindowContext = {},
): ProgressionResult {
  track.goals.forEach(validateGoal);

  const windowed = applyWindow(inputs, { ...context, mode: track.windowMode });

  let weightedFill = 0;
  let totalWeight = 0;
  const goals = track.goals.map((goal): PlayerProgressionGoalStatus => {
    const current = computeMetric(goal.metric, windowed, goal.params);
    weightedFill += goalFill(goal, current) * goal.weight;
    totalWeight += goal.weight;
    return { goalId: goal.goalId, current, threshold: goal.threshold, met: goalMet(goal, current) };
  });

  const progressPct = totalWeight === 0 ? 0 : roundTo((weightedFill / totalWeight) * 100, PROGRESS_PCT_DECIMALS);
  return { progressPct, goals };
}
