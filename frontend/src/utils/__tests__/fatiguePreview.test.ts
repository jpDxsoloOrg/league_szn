import { describe, it, expect } from 'vitest';
import {
  averageInjuryWeeks,
  injuryChance,
  matchDrain,
  matchesUntilBelow,
  matchesUntilEmpty,
  matchesUntilExhausted,
  previewMatch,
  severityWeights,
  MAX_INJURY_CHANCE,
} from '../fatiguePreview';
import { FATIGUE_PREVIEW_CASES, injuryTunablesFixture } from '../../test/injuryTunablesFixture';

describe('fatigue preview maths', () => {
  const tunables = injuryTunablesFixture();

  it.each(FATIGUE_PREVIEW_CASES)('$name', ({ category, format, endurance, stamina, drain, staminaAfter, chance, averageWeeks }) => {
    const preview = previewMatch({ category, format, endurance, stamina }, tunables);
    expect(preview.drain).toBe(drain);
    expect(preview.staminaAfter).toBe(staminaAfter);
    expect(preview.chance).toBeCloseTo(chance, 10);
    expect(preview.averageWeeks).toBeCloseTo(averageWeeks, 10);
  });

  it('never drains below 0, even with a big Endurance reduction', () => {
    const strong = injuryTunablesFixture({ enduranceDrainReduction: 1 });
    expect(matchDrain({ category: 'standard', format: 'singles', endurance: 200 }, strong)).toBe(0);
  });

  it('caps the injury chance at 95%', () => {
    const risky = injuryTunablesFixture({ categoryRisk: { ...tunables.categoryRisk, hardcore: 10 } });
    expect(injuryChance(0, 'hardcore', risky)).toBe(MAX_INJURY_CHANCE);
  });

  it('averages the weeks out by severity weight and mid-range', () => {
    // (60 × 1 + 30 × 2.5 + 10 × 5) / 100
    expect(averageInjuryWeeks(tunables.severities)).toBeCloseTo(1.85, 10);
    expect(averageInjuryWeeks([])).toBe(0);
  });

  it('leans the weeks out towards the worse severities below the low-stamina shift', () => {
    // At 0 stamina the weights become 60 / 60 / 30 (as the backend's severityWeights).
    expect(severityWeights(0, tunables)).toEqual([60, 60, 30]);
    expect(severityWeights(20, tunables)).toEqual([60, 30, 10]);
    expect(averageInjuryWeeks(tunables.severities, severityWeights(0, tunables))).toBeCloseTo(2.4, 10);
  });

  it('flags a stamina below the low-stamina shift', () => {
    expect(previewMatch({ category: 'standard', format: 'singles', endurance: 40, stamina: 30 }, tunables).severityShifted).toBe(true);
    expect(previewMatch({ category: 'standard', format: 'singles', endurance: 40, stamina: 35 }, tunables).severityShifted).toBe(false);
  });

  it('counts matches until a threshold or empty', () => {
    expect(matchesUntilBelow(100, 70, 15)).toBe(3);
    expect(matchesUntilBelow(60, 70, 15)).toBe(0);
    expect(matchesUntilBelow(100, 70, 0)).toBeNull();
    expect(matchesUntilEmpty(100, 15)).toBe(7);
    expect(matchesUntilEmpty(100, 0)).toBeNull();
  });

  it('lists standard singles matches from full to each band', () => {
    const { drain, steps } = matchesUntilExhausted(tunables);
    expect(drain).toBe(15);
    expect(steps).toEqual([
      { belowStamina: 70, chance: 0.03, matches: 3 },
      { belowStamina: 40, chance: 0.08, matches: 5 },
      { belowStamina: 20, chance: 0.15, matches: 6 },
      { belowStamina: 0, chance: null, matches: 7 },
    ]);
  });
});
