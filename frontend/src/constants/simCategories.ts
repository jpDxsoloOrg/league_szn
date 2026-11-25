/**
 * Sim categories (BLD-16). Mirrors `SIM_CATEGORIES` in
 * backend/lib/policies/buildRules.ts. Each stipulation and match type can carry
 * one; a missing category reads as `standard`.
 *
 * Labels: `simCategories.<category>`; example stipulations:
 * `simCategories.examples.<category>`.
 */
export const SIM_CATEGORIES = ['standard', 'highRisk', 'technical', 'endurance', 'hardcore', 'cage'] as const;

export type SimCategory = (typeof SIM_CATEGORIES)[number];

export const DEFAULT_SIM_CATEGORY: SimCategory = 'standard';

export function isSimCategory(value: unknown): value is SimCategory {
  return typeof value === 'string' && (SIM_CATEGORIES as readonly string[]).includes(value);
}

/** English fallbacks for `simCategories.<category>`. */
export const SIM_CATEGORY_LABELS: Readonly<Record<SimCategory, string>> = {
  standard: 'Standard',
  highRisk: 'High risk',
  technical: 'Technical',
  endurance: 'Endurance',
  hardcore: 'Hardcore',
  cage: 'Cage',
};
