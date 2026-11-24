import type { TFunction } from 'i18next';
import type { CountingSinceReason, ProgressionGoalDetail, ProgressionMetric } from '../../types/progression';

/** Mirrors DEFAULT_MIN_RATED_MATCHES / DEFAULT_MIN_REACTIONS in backend/lib/policies/progression.ts. */
const DEFAULT_MIN_RATED_MATCHES = 1;
const DEFAULT_MIN_REACTIONS = 1;
/** Mirrors MAX_STAR_RATING: avgStarRatingBelow is MAX_STAR_RATING minus the average. */
const MAX_STAR_RATING = 5;

export function clampPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
}

/** Share of the goal achieved, 0-1. Mirrors `goalFill` in the backend policy. */
export function goalFill(goal: Pick<ProgressionGoalDetail, 'direction' | 'threshold' | 'current'>): number {
  const { current, threshold } = goal;
  if (current === null) return 0;
  if (goal.direction === 'atMost') {
    return current <= threshold ? 1 : threshold / current;
  }
  if (threshold <= 0) return 1;
  return Math.min(Math.max(current / threshold, 0), 1);
}

/** A metric value for display: win % as a percentage, star ratings to one decimal. */
export function formatMetricValue(t: TFunction, metric: ProgressionMetric, value: number): string {
  switch (metric) {
    case 'winPct':
    case 'lossPct':
      return t('progression.meter.percent', { pct: Math.round(value) });
    case 'avgStarRating':
      return t('progression.goals.stars', { value: value.toFixed(1) });
    case 'avgStarRatingBelow':
      // Stored as 5 - average; shown as the average it stands for.
      return t('progression.goals.stars', { value: (MAX_STAR_RATING - value).toFixed(1) });
    default:
      return String(Math.round(value * 10) / 10);
  }
}

/** The goal's checklist label, e.g. "Compete in 10 matches". */
export function goalLabel(t: TFunction, goal: ProgressionGoalDetail): string {
  const minRatedMatches = goal.params?.minRatedMatches ?? DEFAULT_MIN_RATED_MATCHES;
  const minReactions = goal.params?.minReactions ?? DEFAULT_MIN_REACTIONS;
  const values = {
    count: goal.threshold,
    threshold: formatMetricValue(t, goal.metric, goal.threshold),
    minRatedMatches,
    minReactions,
    lastMatches: goal.params?.lastMatches,
  };
  if (goal.labelKey) {
    const custom = t(goal.labelKey, { ...values, defaultValue: '' });
    if (custom) return custom;
  }
  if (goal.metric === 'contenderRankBest' && goal.direction === 'atMost') {
    return t('progression.goals.contenderRankBest', values);
  }
  if (goal.direction === 'atMost') {
    return t('progression.goals.atMost', { ...values, metric: t(`progression.metrics.${goal.metric}`) });
  }
  if (goal.metric === 'avgStarRating' && minRatedMatches > 1) {
    return t('progression.goals.avgStarRatingMin', values);
  }
  if (goal.metric === 'avgStarRatingBelow') {
    return t(minRatedMatches > 1 ? 'progression.goals.avgStarRatingBelowMin' : 'progression.goals.avgStarRatingBelow', values);
  }
  if ((goal.metric === 'winPct' || goal.metric === 'lossPct') && goal.params?.lastMatches) {
    return t(`progression.goals.${goal.metric}Last`, values);
  }
  return t(`progression.goals.${goal.metric}`, values);
}

/** "7 / 10", or why there is no value yet. */
export function goalProgressText(t: TFunction, goal: ProgressionGoalDetail): string {
  const threshold = formatMetricValue(t, goal.metric, goal.threshold);
  if (goal.current === null) {
    const minRatedMatches = goal.params?.minRatedMatches ?? DEFAULT_MIN_RATED_MATCHES;
    if (goal.metric === 'avgStarRating' || goal.metric === 'avgStarRatingBelow') {
      return t('progression.goals.needsRated', { count: minRatedMatches });
    }
    return t('progression.goals.noValue', { threshold });
  }
  return t('progression.goals.currentOf', {
    current: formatMetricValue(t, goal.metric, goal.current),
    threshold,
  });
}

/**
 * "Counting since your promotion to Raw on Jun 1, 2026", or the date alone
 * when no reason is known. `date` is already formatted for the locale.
 */
export function countingSinceText(t: TFunction, date: string, reason?: CountingSinceReason): string {
  if (!reason) return t('progression.countingSince.dateOnly', { date });
  if (reason.type === 'goalsReset') return t('progression.countingSince.goalsReset', { date });
  if (reason.divisionName) {
    return t(`progression.countingSince.${reason.type}`, { date, division: reason.divisionName });
  }
  return t(`progression.countingSince.${reason.type}Unnamed`, { date });
}
