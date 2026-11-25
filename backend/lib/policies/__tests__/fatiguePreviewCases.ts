/**
 * Copy of `FATIGUE_PREVIEW_CASES` from frontend/src/test/injuryTunablesFixture.ts
 * (INJ-10), run against the real policy by fatiguePreviewParity.test.ts so
 * the admin preview can't drift from fatigue.ts. That test also fails when
 * the two copies differ: change both together.
 */
import type { SimCategory } from '../buildRules';

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

/** Worked cases over DEFAULT_INJURY_TUNABLES. */
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
