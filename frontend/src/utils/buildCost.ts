import type { BuildCoreStat, BuildRules } from '../services/api/builds.api';

/**
 * Client-side build pricing (BLD-12), so the editor can show a live budget.
 * Mirrors `statCost`, `moveLevelCost` and `buildCost` in
 * backend/lib/policies/wrestlerBuild.ts, but every number comes from
 * `GET /builds/rules`. The server stays the source of truth on save.
 */

export type BuildCostRules = Pick<BuildRules, 'stats' | 'moves'>;

/**
 * Build points needed to raise a stat from base to `value`. At or below base
 * costs 0; above the cap is priced as the cap; fractions round down.
 */
export function statCost(value: number, rules: BuildCostRules): number {
  const target = Math.min(Math.floor(value), rules.stats.cap);
  let cost = 0;
  for (const band of rules.stats.costBands) {
    if (target < band.from) break;
    const pointsInBand = Math.min(target, band.to) - band.from + 1;
    cost += pointsInBand * band.costPerPoint;
  }
  return cost;
}

/** Cost of raising a stat from `value` to `value + 1`, or null at the cap. */
export function nextStatPointCost(value: number, rules: BuildCostRules): number | null {
  if (value >= rules.stats.cap) return null;
  return statCost(value + 1, rules) - statCost(value, rules);
}

function levelsAboveMin(levels: readonly number[], minLevel: number): number {
  return levels.reduce((sum, level) => sum + Math.max(0, level - minLevel), 0);
}

/** Build points spent on move levels above the minimum. */
export function moveLevelCost(
  signatureLevels: readonly number[],
  finisherLevels: readonly number[],
  rules: BuildCostRules,
): number {
  const { minLevel, signatureLevelCost, finisherLevelCost } = rules.moves;
  return (
    levelsAboveMin(signatureLevels, minLevel) * signatureLevelCost +
    levelsAboveMin(finisherLevels, minLevel) * finisherLevelCost
  );
}

export interface BuildCostInput {
  stats: Record<BuildCoreStat, number>;
  signatureLevels: readonly number[];
  finisherLevels: readonly number[];
}

/** Total build cost: stats plus move levels. The specialty is free. */
export function buildCost(input: BuildCostInput, rules: BuildCostRules): number {
  const statsCost = rules.stats.coreStats.reduce((sum, stat) => sum + statCost(input.stats[stat], rules), 0);
  return statsCost + moveLevelCost(input.signatureLevels, input.finisherLevels, rules);
}

/**
 * The highest value `stat` can reach without the build going over `budget`,
 * never below its current value (an over-budget build can still lower stats).
 */
export function maxAffordableStat(
  input: BuildCostInput,
  stat: BuildCoreStat,
  budget: number,
  rules: BuildCostRules,
): number {
  const current = input.stats[stat];
  const otherCost = buildCost(input, rules) - statCost(current, rules);
  let value = current;
  while (value < rules.stats.cap && otherCost + statCost(value + 1, rules) <= budget) value += 1;
  return value;
}
