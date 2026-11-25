import type { BuildBudgetRules } from '../services/api/builds.api';
import type { Division } from '../types';
import { getDivisionTier } from './divisionTiers';

/**
 * Build budget for a division, from the numbers `GET /builds/rules` returns.
 * Mirrors `budgetForDivision` in backend/lib/policies/buildRules.ts:
 * no division → noDivision; developmental → developmental whatever the tier;
 * a tier → that tier's budget or the default; no tier → the default.
 */
export function budgetForDivision(
  budgets: BuildBudgetRules,
  division: Pick<Division, 'tier' | 'isDevelopmental'> | null | undefined,
): number {
  if (!division) return budgets.noDivision;
  if (division.isDevelopmental === true) return budgets.developmental;
  const tier = getDivisionTier(division);
  if (tier === undefined) return budgets.defaultTier;
  return budgets.tiers[String(tier)] ?? budgets.defaultTier;
}
