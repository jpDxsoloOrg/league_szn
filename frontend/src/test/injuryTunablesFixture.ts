import type { SimCategory } from '../constants/simCategories';
import type { InjuryTunables } from '../types/injury';

/**
 * `DEFAULT_INJURY_TUNABLES` as backend/lib/policies/fatigueDefaults.ts has it
 * (INJ-01). Shared by the injury settings tests (INJ-10).
 */
export function injuryTunablesFixture(overrides: Partial<InjuryTunables> = {}): InjuryTunables {
  return {
    maxStamina: 100,
    drainByCategory: { standard: 15, highRisk: 25, technical: 20, endurance: 30, hardcore: 25, cage: 25 },
    formatMultiplier: { singles: 1, tag: 0.7, multiPerson: 0.8, battleRoyal: 0.6 },
    enduranceDrainReduction: 0.3,
    injuryChanceBands: [
      { minStamina: 70, chance: 0.01 },
      { minStamina: 40, chance: 0.03 },
      { minStamina: 20, chance: 0.08 },
      { minStamina: 0, chance: 0.15 },
    ],
    categoryRisk: { standard: 1, highRisk: 1.4, technical: 1.1, endurance: 1.2, hardcore: 1.5, cage: 1.3 },
    severities: [
      { key: 'minor', weight: 60, minWeeks: 1, maxWeeks: 1 },
      { key: 'moderate', weight: 30, minWeeks: 2, maxWeeks: 3 },
      { key: 'major', weight: 10, minWeeks: 4, maxWeeks: 6 },
    ],
    lowStaminaSeverityShift: 20,
    weeklyRecovery: 'full',
    timezone: 'America/New_York',
    simStaminaFloor: 0.85,
    simInjuredPenalty: 0.75,
    version: 0,
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  };
}

export interface FatiguePreviewCase {
  name: string;
  category: SimCategory;
  format: string;
  endurance: number;
  stamina: number;
  drain: number;
  staminaAfter: number;
  chance: number;
  /** Average weeks out if injured, after the low-stamina severity shift. */
  averageWeeks: number;
}

/**
 * Worked cases over the default tunables, checked against the backend policy
 * (backend/lib/policies/fatigue.ts): drain = category × format ×
 * (1 − k × (endurance − 40) / 60), rounded; the first band reached × category
 * risk, capped at 95%; weeks out weighted by the severities after the
 * low-stamina shift.
 *
 * The backend runs the same table from
 * backend/lib/policies/__tests__/fatiguePreviewCases.ts, and its parity test
 * fails if the two copies differ. Change both together.
 */
export const FATIGUE_PREVIEW_CASES: readonly FatiguePreviewCase[] = [
  { name: 'standard singles from full', category: 'standard', format: 'singles', endurance: 40, stamina: 100, drain: 15, staminaAfter: 85, chance: 0.01, averageWeeks: 1.85 },
  { name: 'band edge: exactly 70', category: 'standard', format: 'singles', endurance: 40, stamina: 85, drain: 15, staminaAfter: 70, chance: 0.01, averageWeeks: 1.85 },
  { name: 'band edge: 69', category: 'standard', format: 'singles', endurance: 40, stamina: 84, drain: 15, staminaAfter: 69, chance: 0.03, averageWeeks: 1.85 },
  { name: 'hardcore tag rounds 17.5 up', category: 'hardcore', format: 'tag', endurance: 40, stamina: 50, drain: 18, staminaAfter: 32, chance: 0.12, averageWeeks: 1.85 },
  { name: 'maxed Endurance cuts drain by k', category: 'endurance', format: 'singles', endurance: 100, stamina: 30, drain: 21, staminaAfter: 9, chance: 0.18, averageWeeks: 281.25 / 127.5 },
  { name: 'Endurance above the cap counts as the cap', category: 'endurance', format: 'singles', endurance: 150, stamina: 30, drain: 21, staminaAfter: 9, chance: 0.18, averageWeeks: 281.25 / 127.5 },
  { name: 'battle royal clamps at 0', category: 'highRisk', format: 'battleRoyal', endurance: 70, stamina: 10, drain: 13, staminaAfter: 0, chance: 0.21, averageWeeks: 2.4 },
  { name: 'hardcore at 0 stays under the cap', category: 'hardcore', format: 'singles', endurance: 40, stamina: 20, drain: 25, staminaAfter: 0, chance: 0.225, averageWeeks: 2.4 },
  { name: 'unknown format uses 1', category: 'cage', format: 'ironMan', endurance: 40, stamina: 100, drain: 25, staminaAfter: 75, chance: 0.013, averageWeeks: 1.85 },
];
