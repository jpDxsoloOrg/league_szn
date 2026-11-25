import type { SimCategory } from '../constants/simCategories';
import {
  ENDURANCE_BASELINE,
  ENDURANCE_REDUCTION_RANGE,
  type InjurySeverity,
  type InjuryTunablesInput,
} from '../types/injury';

/*
 * Client copy of the deterministic parts of the fatigue policy (INJ-02,
 * backend/lib/policies/fatigue.ts) for the admin preview (INJ-10). Only the
 * maths a GM needs to judge the numbers: drain, stamina after, injury chance
 * and the average weeks out. Keep in step with the backend; the shared cases
 * live in src/test/injuryTunablesFixture.ts.
 */

/** The injury chance never goes above this, whatever the category risk. */
export const MAX_INJURY_CHANCE = 0.95;

export interface DrainInput {
  category: SimCategory;
  format: string;
  endurance: number;
}

/** Stamina one match takes: category drain × format multiplier × Endurance factor, rounded, never below 0. */
export function matchDrain({ category, format, endurance }: DrainInput, tunables: InjuryTunablesInput): number {
  const base = tunables.drainByCategory[category];
  const formatMultiplier = tunables.formatMultiplier[format] ?? 1;
  const enduranceFactor = 1 - tunables.enduranceDrainReduction * (endurance - ENDURANCE_BASELINE) / ENDURANCE_REDUCTION_RANGE;
  return Math.max(0, Math.round(base * formatMultiplier * enduranceFactor));
}

/** Stamina after a match, kept in [0, maxStamina]. */
export function applyDrain(stamina: number, drain: number, maxStamina: number): number {
  return Math.min(maxStamina, Math.max(0, stamina - drain));
}

/** The first band (highest first) whose minStamina the stamina reaches, × category risk, capped. */
export function injuryChance(staminaAfter: number, category: SimCategory, tunables: InjuryTunablesInput): number {
  const band = tunables.injuryChanceBands.find((entry) => entry.minStamina <= staminaAfter);
  const baseChance = band?.chance ?? 0;
  return Math.min(MAX_INJURY_CHANCE, baseChance * tunables.categoryRisk[category]);
}

/**
 * Weeks out for an average injury, from the severity weights and each
 * severity's mid-range. Ignores the low-stamina shift, which only makes the
 * worse severities more likely.
 */
export function averageInjuryWeeks(severities: readonly InjurySeverity[]): number {
  const totalWeight = severities.reduce((sum, severity) => sum + severity.weight, 0);
  if (totalWeight <= 0) return 0;
  const weighted = severities.reduce(
    (sum, severity) => sum + severity.weight * ((severity.minWeeks + severity.maxWeeks) / 2),
    0,
  );
  return weighted / totalWeight;
}

/**
 * Matches from `startStamina` until stamina drops below `threshold`.
 * 0 when it already is; null when the drain is 0 and it never will.
 */
export function matchesUntilBelow(startStamina: number, threshold: number, drain: number): number | null {
  if (startStamina < threshold) return 0;
  if (drain <= 0) return null;
  return Math.floor((startStamina - threshold) / drain) + 1;
}

/** Matches from `startStamina` until stamina is 0; null when the drain is 0. */
export function matchesUntilEmpty(startStamina: number, drain: number): number | null {
  if (startStamina <= 0) return 0;
  if (drain <= 0) return null;
  return Math.ceil(startStamina / drain);
}

export interface FatiguePreview {
  drain: number;
  staminaAfter: number;
  chance: number;
  averageWeeks: number;
  /** chance × averageWeeks: weeks lost per match on average. */
  expectedWeeksLost: number;
  /** True when the stamina after is below the low-stamina severity shift. */
  severityShifted: boolean;
}

export function previewMatch(
  input: DrainInput & { stamina: number },
  tunables: InjuryTunablesInput,
): FatiguePreview {
  const drain = matchDrain(input, tunables);
  const staminaAfter = applyDrain(input.stamina, drain, tunables.maxStamina);
  const chance = injuryChance(staminaAfter, input.category, tunables);
  const averageWeeks = averageInjuryWeeks(tunables.severities);
  return {
    drain,
    staminaAfter,
    chance,
    averageWeeks,
    expectedWeeksLost: chance * averageWeeks,
    severityShifted: staminaAfter < tunables.lowStaminaSeverityShift,
  };
}

export interface ExhaustionStep {
  /** Stamina must drop below this to reach the band; 0 for the empty row. */
  belowStamina: number;
  /** The band's base chance, or null for the empty row. */
  chance: number | null;
  matches: number | null;
}

/**
 * Standard singles matches from full stamina (Endurance at the baseline) to
 * each band after the first, then to 0 stamina.
 */
export function matchesUntilExhausted(tunables: InjuryTunablesInput): { drain: number; steps: ExhaustionStep[] } {
  const drain = matchDrain({ category: 'standard', format: 'singles', endurance: ENDURANCE_BASELINE }, tunables);
  const bands = tunables.injuryChanceBands;
  const steps: ExhaustionStep[] = [];
  bands.forEach((band, index) => {
    const previous = bands[index - 1];
    if (!previous) return;
    steps.push({
      belowStamina: previous.minStamina,
      chance: band.chance,
      matches: matchesUntilBelow(tunables.maxStamina, previous.minStamina, drain),
    });
  });
  steps.push({ belowStamina: 0, chance: null, matches: matchesUntilEmpty(tunables.maxStamina, drain) });
  return { drain, steps };
}
