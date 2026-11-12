/**
 * Progression milestones (CUP-11). Pure: no I/O.
 *
 * Compares a recomputed `PlayerProgression` row with what was already
 * announced and decides which milestones are new:
 *   - progress crossing 50%, 75% and 100%
 *   - a goal flipping to met
 *
 * Dedupe source of truth is the row's own `notifiedThresholds` /
 * `notifiedGoalIds`, read from the upsert result (strongly consistent).
 * `before` is only used when those lists were never written:
 *   - no `before` (new row): baseline. Whatever is already reached is
 *     recorded as notified, nothing is announced (no backfill spam).
 *   - `before` but no lists (row older than CUP-11): what `before` had
 *     already reached counts as notified.
 *
 * Morale rule: only positive milestones are announced. A drop never
 * announces anything and never removes a milestone from the lists, so
 * dipping below 50% and climbing back does not re-announce it. Relegation
 * tracks never announce at all: progress there is bad news.
 */

import type { NotifiedMilestoneCounts, NotifiedMilestones } from '../repositories/progression';
import type { PlayerProgression, ProgressionKind } from '../repositories/types';

/** Progress percentages that are announced, ascending. */
export const PROGRESS_MILESTONE_THRESHOLDS: readonly number[] = [50, 75, 100];

export interface MilestoneInput {
  before?: PlayerProgression;
  /** The stored row after the upsert, with any stored dedupe lists. */
  after: PlayerProgression;
}

export interface MilestonePlan {
  playerId: string;
  trackId: string;
  /** Thresholds to announce now, ascending. */
  newThresholds: number[];
  /** GoalIds that newly flipped to met, in track goal order. */
  newGoalIds: string[];
  /** Lists to store, or null when the stored lists are already up to date. */
  next: NotifiedMilestones | null;
  /** Sizes of the stored lists, for the optimistic write. */
  expected: NotifiedMilestoneCounts;
}

const reachedThresholds = (row: PlayerProgression): number[] =>
  PROGRESS_MILESTONE_THRESHOLDS.filter((threshold) => row.progressPct >= threshold);

const metGoalIds = (row: PlayerProgression): string[] =>
  row.goals.filter((goal) => goal.met).map((goal) => goal.goalId);

const sameMembers = <T>(stored: readonly T[] | undefined, next: readonly T[]): boolean =>
  stored !== undefined && stored.length === next.length && next.every((value) => stored.includes(value));

/** Decide which milestones a recomputed row newly reached. */
export function detectMilestones(input: MilestoneInput, kind: ProgressionKind): MilestonePlan {
  const { before, after } = input;
  const expected: NotifiedMilestoneCounts = {
    thresholds: after.notifiedThresholds?.length ?? 0,
    goals: after.notifiedGoalIds?.length ?? 0,
  };
  const plan: MilestonePlan = {
    playerId: after.playerId,
    trackId: after.trackId,
    newThresholds: [],
    newGoalIds: [],
    next: null,
    expected,
  };
  if (kind === 'relegation') return plan;

  const reached = reachedThresholds(after);
  const met = metGoalIds(after);
  const baseline = before ?? after;
  const notifiedThresholds = after.notifiedThresholds ?? reachedThresholds(baseline);
  const notifiedGoalIds = after.notifiedGoalIds ?? metGoalIds(baseline);

  plan.newThresholds = reached.filter((threshold) => !notifiedThresholds.includes(threshold));
  plan.newGoalIds = met.filter((goalId) => !notifiedGoalIds.includes(goalId));

  const next: NotifiedMilestones = {
    notifiedThresholds: [...new Set([...notifiedThresholds, ...reached])].sort((a, b) => a - b),
    notifiedGoalIds: [...new Set([...notifiedGoalIds, ...met])],
  };
  const upToDate =
    sameMembers(after.notifiedThresholds, next.notifiedThresholds) &&
    sameMembers(after.notifiedGoalIds, next.notifiedGoalIds);
  plan.next = upToDate ? null : next;
  return plan;
}

/** True when the plan announces anything. */
export const hasNewMilestones = (plan: MilestonePlan): boolean =>
  plan.newThresholds.length > 0 || plan.newGoalIds.length > 0;
