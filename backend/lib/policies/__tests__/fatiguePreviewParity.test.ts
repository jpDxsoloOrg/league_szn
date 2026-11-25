import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyDrain, injuryChance, MAX_INJURY_CHANCE, matchDrain, severityWeights, staminaOf } from '../fatigue';
import { DEFAULT_INJURY_TUNABLES } from '../fatigueDefaults';
import { FATIGUE_PREVIEW_CASES } from './fatiguePreviewCases';

/**
 * INJ-10: the admin page previews drain, injury chance and weeks out with a
 * client copy of this policy (frontend/src/utils/fatiguePreview.ts). Both
 * sides run the same table of cases, so a change to either shows up here.
 */

const FRONTEND_FIXTURE = resolve(__dirname, '../../../../frontend/src/test/injuryTunablesFixture.ts');
const BACKEND_FIXTURE = resolve(__dirname, 'fatiguePreviewCases.ts');

/** The `FATIGUE_PREVIEW_CASES` declaration through its closing `];`. */
function casesBlock(path: string): string {
  const source = readFileSync(path, 'utf8');
  const start = source.indexOf('export const FATIGUE_PREVIEW_CASES');
  const end = source.indexOf('];', start);
  if (start < 0 || end < 0) throw new Error(`No FATIGUE_PREVIEW_CASES in ${path}`);
  return source.slice(start, end + 2);
}

/** Mean weeks out: each severity's mid-range, weighted as rollInjury weights it. */
function averageWeeks(staminaAfter: number): number {
  const weights = severityWeights(staminaAfter, DEFAULT_INJURY_TUNABLES);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const weighted = DEFAULT_INJURY_TUNABLES.severities.reduce(
    (sum, severity, index) => sum + weights[index] * ((severity.minWeeks + severity.maxWeeks) / 2),
    0,
  );
  return weighted / total;
}

describe('fatigue policy vs the admin preview cases', () => {
  it('uses the same table as the frontend', () => {
    expect(casesBlock(BACKEND_FIXTURE)).toBe(casesBlock(FRONTEND_FIXTURE));
  });

  it.each(FATIGUE_PREVIEW_CASES)('$name', (testCase) => {
    const tunables = DEFAULT_INJURY_TUNABLES;
    const drain = matchDrain(
      { category: testCase.category, format: testCase.format, endurance: testCase.endurance },
      tunables,
    );
    const staminaAfter = applyDrain(staminaOf(testCase.stamina, tunables), drain, tunables);
    const chance = injuryChance(staminaAfter, testCase.category, tunables);

    expect(drain).toBe(testCase.drain);
    expect(staminaAfter).toBe(testCase.staminaAfter);
    expect(chance).toBeCloseTo(testCase.chance, 10);
    expect(chance).toBeLessThanOrEqual(MAX_INJURY_CHANCE);
    expect(averageWeeks(staminaAfter)).toBeCloseTo(testCase.averageWeeks, 10);
  });
});
