import type { TFunction } from 'i18next';
import type { ProgressionGoalDetail, ProgressionMetric } from '../../types/progression';

/** Mirrors DEFAULT_MIN_RATED_MATCHES / DEFAULT_MIN_REACTIONS in backend/lib/policies/progression.ts. */
const DEFAULT_MIN_RATED_MATCHES = 1;
const DEFAULT_MIN_REACTIONS = 1;

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
      return t('progression.meter.percent', { pct: Math.round(value) });
    case 'avgStarRating':
      return t('progression.goals.stars', { value: value.toFixed(1) });
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
  };
  if (goal.labelKey) {
    const custom = t(goal.labelKey, { ...values, defaultValue: '' });
    if (custom) return custom;
  }
  if (goal.direction === 'atMost') {
    return t('progression.goals.atMost', { ...values, metric: t(`progression.metrics.${goal.metric}`) });
  }
  if (goal.metric === 'avgStarRating' && minRatedMatches > 1) {
    return t('progression.goals.avgStarRatingMin', values);
  }
  return t(`progression.goals.${goal.metric}`, values);
}

/** "7 / 10", or why there is no value yet. */
export function goalProgressText(t: TFunction, goal: ProgressionGoalDetail): string {
  const threshold = formatMetricValue(t, goal.metric, goal.threshold);
  if (goal.current === null) {
    const minRatedMatches = goal.params?.minRatedMatches ?? DEFAULT_MIN_RATED_MATCHES;
    if (goal.metric === 'avgStarRating') {
      return t('progression.goals.needsRated', { count: minRatedMatches });
    }
    return t('progression.goals.noValue', { threshold });
  }
  return t('progression.goals.currentOf', {
    current: formatMetricValue(t, goal.metric, goal.current),
    threshold,
  });
}
