import type { SimCategory } from '../constants/simCategories';
import {
  ENDURANCE_BASELINE,
  ENDURANCE_REDUCTION_RANGE,
  type InjurySeverity,
  type InjuryTunablesInput,
} from '../types/injury';

/*
 * Client copy of the deterministic parts of the fatigue policy (INJ-02,
 * backend/lib/policies/fatigue.ts) for the admin preview (INJ-10): drain,
 * stamina after, injury chance and the average weeks out. Same formulas in
 * the same order as the backend, so the numbers match to the last digit.
 * The shared cases in src/test/injuryTunablesFixture.ts also run against the
 * backend (backend/lib/policies/__tests__/fatiguePreviewParity.test.ts).
 */

/** The injury chance never goes above this, whatever the band and category risk. */
export const MAX_INJURY_CHANCE = 0.95;

/** Endurance is clamped to [0, this] before it adjusts the drain (the build stat cap). */
export const ENDURANCE_CAP = ENDURANCE_BASELINE + ENDURANCE_REDUCTION_RANGE;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export interface DrainInput {
  category: SimCategory;
  format: string;
  endurance: number;
}

/** The drain multiplier for a format key; unknown, missing or invalid values use 1. */
export function formatMultiplierFor(format: string | undefined, tunables: Pick<InjuryTunablesInput, 'formatMultiplier'>): number {
  if (!format) return 1;
  const multiplier = tunables.formatMultiplier[format];
  return typeof multiplier === 'number' && Number.isFinite(multiplier) && multiplier >= 0 ? multiplier : 1;
}

/**
 * Stamina one match takes, an integer ≥ 0:
 * drainByCategory × formatMultiplier × (1 − k × (endurance − base) / range).
 */
export function matchDrain({ category, format, endurance }: DrainInput, tunables: InjuryTunablesInput): number {
  const base = tunables.drainByCategory[category] ?? 0;
  const clampedEndurance = clamp(endurance, 0, ENDURANCE_CAP);
  const enduranceFactor = Math.max(
    0,
    1 - tunables.enduranceDrainReduction * ((clampedEndurance - ENDURANCE_BASELINE) / ENDURANCE_REDUCTION_RANGE),
  );
  const drain = base * formatMultiplierFor(format, tunables) * enduranceFactor;
  return Math.max(0, Math.round(drain));
}

/** Stamina after a match, kept in [0, maxStamina]. */
export function applyDrain(stamina: number, drain: number, maxStamina: number): number {
  return clamp(stamina - Math.max(0, drain), 0, maxStamina);
}

/**
 * The first band (highest first) whose minStamina the stamina reaches (the
 * lowest band otherwise), × category risk, capped at MAX_INJURY_CHANCE.
 */
export function injuryChance(staminaAfter: number, category: SimCategory, tunables: InjuryTunablesInput): number {
  const bands = [...tunables.injuryChanceBands].sort((a, b) => b.minStamina - a.minStamina);
  const band = bands.find((item) => item.minStamina <= staminaAfter) ?? bands[bands.length - 1];
  if (!band) return 0;
  const risk = tunables.categoryRisk[category] ?? 1;
  return Math.min(MAX_INJURY_CHANCE, Math.max(0, band.chance * risk));
}

/**
 * Severity weights after the low-stamina shift. Below
 * `lowStaminaSeverityShift`, each severity's weight is multiplied by
 * 1 + depth × rank (mildest = 0), depth going from 0 at the threshold to 1 at
 * 0 stamina.
 */
export function severityWeights(staminaAfter: number, tunables: InjuryTunablesInput): number[] {
  const threshold = tunables.lowStaminaSeverityShift;
  const depth = threshold > 0 && staminaAfter < threshold
    ? clamp((threshold - staminaAfter) / threshold, 0, 1)
    : 0;
  return tunables.severities.map((severity, rank) => Math.max(0, severity.weight) * (1 + depth * rank));
}

/**
 * Average weeks out if injured: each severity's mid-range (weeks are drawn
 * uniformly from minWeeks to maxWeeks), weighted by `weights` (default: the
 * severities' own weights, i.e. no low-stamina shift).
 */
export function averageInjuryWeeks(
  severities: readonly InjurySeverity[],
  weights: readonly number[] = severities.map((severity) => Math.max(0, severity.weight)),
): number {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) return 0;
  const weighted = severities.reduce(
    (sum, severity, index) => sum + (weights[index] ?? 0) * ((severity.minWeeks + severity.maxWeeks) / 2),
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
  /** Average weeks out if injured, with the low-stamina severity shift at the stamina after. */
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
  const averageWeeks = averageInjuryWeeks(tunables.severities, severityWeights(staminaAfter, tunables));
  return {
    drain,
    staminaAfter,
    chance,
    averageWeeks,
    expectedWeeksLost: chance * averageWeeks,
    severityShifted: tunables.lowStaminaSeverityShift > 0 && staminaAfter < tunables.lowStaminaSeverityShift,
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
