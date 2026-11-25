import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INJURY_TUNABLES,
  INJURY_TUNABLES_VERSIONS_KEPT,
  appendInjuryTunablesVersion,
  mergeInjuryTunables,
  toInjuryTunablesInput,
  type InjuryTunablesInput,
} from '../fatigueDefaults';
import { isValidTimeZone, validateInjuryTunables } from '../injuryTunablesValidation';

const defaults = (): InjuryTunablesInput => toInjuryTunablesInput(DEFAULT_INJURY_TUNABLES);

function expectError(input: unknown, message: string): void {
  const result = validateInjuryTunables(input);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toContain(message);
}

describe('injury tunables defaults (INJ-01)', () => {
  it('match the placeholder numbers from the ticket', () => {
    expect(DEFAULT_INJURY_TUNABLES).toMatchObject({
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
      categoryRisk: { standard: 1, hardcore: 1.5, cage: 1.3, highRisk: 1.4, technical: 1.1, endurance: 1.2 },
      lowStaminaSeverityShift: 20,
      weeklyRecovery: 'full',
      timezone: 'America/New_York',
      simStaminaFloor: 0.85,
      simInjuredPenalty: 0.75,
      version: 0,
    });
    expect(DEFAULT_INJURY_TUNABLES.severities.map((severity) => severity.key)).toEqual(['minor', 'moderate', 'major']);
  });

  it('pass their own validation', () => {
    expect(validateInjuryTunables(defaults())).toEqual({ ok: true, tunables: defaults() });
  });

  it('fall back to the defaults when nothing is stored', () => {
    expect(mergeInjuryTunables(undefined)).toEqual(DEFAULT_INJURY_TUNABLES);
  });

  it('fill fields missing from an older stored row', () => {
    const stored = { version: 3, drainByCategory: { standard: 10 } } as never;
    const merged = mergeInjuryTunables(stored);
    expect(merged.version).toBe(3);
    expect(merged.drainByCategory).toEqual({ ...DEFAULT_INJURY_TUNABLES.drainByCategory, standard: 10 });
    expect(merged.timezone).toBe('America/New_York');
  });

  it('keep a stored format map as the whole list', () => {
    const merged = mergeInjuryTunables({ formatMultiplier: { singles: 1 } });
    expect(merged.formatMultiplier).toEqual({ singles: 1 });
  });

  it('hand out copies, so callers cannot change the defaults', () => {
    mergeInjuryTunables(undefined).injuryChanceBands[0].chance = 0.9;
    expect(DEFAULT_INJURY_TUNABLES.injuryChanceBands[0].chance).toBe(0.01);
  });
});

describe('appendInjuryTunablesVersion', () => {
  it('bumps the version and records who saved it', () => {
    const [first] = appendInjuryTunablesVersion([], defaults(), 'gm-jane', '2026-11-24T00:00:00.000Z');
    expect(first).toMatchObject({ version: 1, updatedBy: 'gm-jane', updatedAt: '2026-11-24T00:00:00.000Z' });

    const versions = appendInjuryTunablesVersion([first], defaults(), 'gm-joe', 'later');
    expect(versions.map((entry) => entry.version)).toEqual([2, 1]);
  });

  it(`keeps only the last ${INJURY_TUNABLES_VERSIONS_KEPT} versions`, () => {
    let versions = appendInjuryTunablesVersion([], defaults(), 'gm', 't');
    for (let index = 0; index < INJURY_TUNABLES_VERSIONS_KEPT + 5; index++) {
      versions = appendInjuryTunablesVersion(versions, defaults(), 'gm', 't');
    }
    expect(versions).toHaveLength(INJURY_TUNABLES_VERSIONS_KEPT);
    expect(versions[0].version).toBe(INJURY_TUNABLES_VERSIONS_KEPT + 6);
  });
});

describe('validateInjuryTunables', () => {
  it('rejects unknown and missing keys', () => {
    expectError({ ...defaults(), surprise: 1 }, 'Unknown setting: settings.surprise');
    const missing: Partial<InjuryTunablesInput> = defaults();
    delete missing.timezone;
    expectError(missing, 'settings.timezone is required');
  });

  it('rejects a drain that is negative, fractional or above max stamina', () => {
    expectError({ ...defaults(), drainByCategory: { ...defaults().drainByCategory, cage: -1 } }, 'drainByCategory.cage');
    expectError({ ...defaults(), drainByCategory: { ...defaults().drainByCategory, cage: 2.5 } }, 'drainByCategory.cage');
    expectError({ ...defaults(), drainByCategory: { ...defaults().drainByCategory, cage: 101 } }, 'drainByCategory.cage');
  });

  it('requires a drain and a risk for every sim category', () => {
    const { cage: _cage, ...withoutCage } = defaults().drainByCategory;
    expectError({ ...defaults(), drainByCategory: withoutCage }, 'drainByCategory.cage is required');
    expectError({ ...defaults(), categoryRisk: { ...defaults().categoryRisk, ladder: 1 } }, 'Unknown setting: categoryRisk.ladder');
  });

  it('requires risk and format multipliers above 0', () => {
    expectError({ ...defaults(), categoryRisk: { ...defaults().categoryRisk, hardcore: 0 } }, 'categoryRisk.hardcore');
    expectError({ ...defaults(), formatMultiplier: { singles: 0 } }, 'formatMultiplier.singles');
    expectError({ ...defaults(), formatMultiplier: { '': 1 } }, 'formatMultiplier keys');
  });

  it('trims format keys and accepts an empty map (every format uses 1)', () => {
    const result = validateInjuryTunables({ ...defaults(), formatMultiplier: { ' tag ': 0.5 } });
    expect(result.ok && result.tunables.formatMultiplier).toEqual({ tag: 0.5 });
    expect(validateInjuryTunables({ ...defaults(), formatMultiplier: {} }).ok).toBe(true);
  });

  it.each([-0.01, 1.01, Number.NaN])('rejects a band chance of %s', (chance) => {
    const bands = [{ minStamina: 50, chance }, { minStamina: 0, chance: 0.1 }];
    expectError({ ...defaults(), injuryChanceBands: bands }, 'injuryChanceBands[0].chance');
  });

  it('accepts band chances of exactly 0 and 1', () => {
    const bands = [{ minStamina: 50, chance: 0 }, { minStamina: 0, chance: 1 }];
    expect(validateInjuryTunables({ ...defaults(), injuryChanceBands: bands }).ok).toBe(true);
  });

  it('requires the bands sorted highest first with no repeats', () => {
    expectError(
      { ...defaults(), injuryChanceBands: [{ minStamina: 20, chance: 0.1 }, { minStamina: 40, chance: 0.1 }, { minStamina: 0, chance: 0.1 }] },
      'sorted',
    );
    expectError(
      { ...defaults(), injuryChanceBands: [{ minStamina: 40, chance: 0.1 }, { minStamina: 40, chance: 0.1 }, { minStamina: 0, chance: 0.1 }] },
      'sorted',
    );
  });

  it('requires the last band to start at 0 and at least one band', () => {
    expectError({ ...defaults(), injuryChanceBands: [{ minStamina: 10, chance: 0.1 }] }, 'start at 0');
    expectError({ ...defaults(), injuryChanceBands: [] }, 'non-empty');
  });

  it('rejects a band above max stamina', () => {
    expectError({ ...defaults(), injuryChanceBands: [{ minStamina: 150, chance: 0.1 }, { minStamina: 0, chance: 0.1 }] }, 'minStamina');
  });

  it('requires severity weights above 0', () => {
    const severities = defaults().severities.map((severity) => ({ ...severity }));
    severities[2].weight = 0;
    expectError({ ...defaults(), severities }, 'severities[2].weight');
  });

  it('requires minWeeks ≤ maxWeeks', () => {
    const severities = defaults().severities.map((severity) => ({ ...severity }));
    severities[1] = { ...severities[1], minWeeks: 4, maxWeeks: 3 };
    expectError({ ...defaults(), severities }, 'severities[1].minWeeks must not be more than maxWeeks');
  });

  it('allows minWeeks equal to maxWeeks', () => {
    const severities = defaults().severities.map((severity) => ({ ...severity, minWeeks: 2, maxWeeks: 2 }));
    expect(validateInjuryTunables({ ...defaults(), severities }).ok).toBe(true);
  });

  it('requires minor, moderate and major in that order, once each', () => {
    const [minor, moderate, major] = defaults().severities;
    expectError({ ...defaults(), severities: [moderate, minor, major] }, 'severities[0].key must be "minor"');
    expectError({ ...defaults(), severities: [minor, moderate] }, 'severities must list each of');
  });

  it.each([0, 0.3, 1])('accepts an endurance reduction of %s', (reduction) => {
    expect(validateInjuryTunables({ ...defaults(), enduranceDrainReduction: reduction }).ok).toBe(true);
  });

  it('rejects an endurance reduction outside [0, 1]', () => {
    expectError({ ...defaults(), enduranceDrainReduction: 1.5 }, 'enduranceDrainReduction');
  });

  it('accepts full or a whole amount for weekly recovery, nothing else', () => {
    expect(validateInjuryTunables({ ...defaults(), weeklyRecovery: 40 }).ok).toBe(true);
    expectError({ ...defaults(), weeklyRecovery: 0 }, 'weeklyRecovery');
    expectError({ ...defaults(), weeklyRecovery: 101 }, 'weeklyRecovery');
    expectError({ ...defaults(), weeklyRecovery: 'half' }, 'weeklyRecovery');
  });

  it('rejects a low-stamina shift above max stamina', () => {
    expectError({ ...defaults(), lowStaminaSeverityShift: 101 }, 'lowStaminaSeverityShift');
  });

  it('keeps the sim multipliers in [0, 1]', () => {
    expectError({ ...defaults(), simStaminaFloor: 1.2 }, 'simStaminaFloor');
    expectError({ ...defaults(), simInjuredPenalty: -0.1 }, 'simInjuredPenalty');
  });

  it('accepts a valid IANA time zone and rejects anything else', () => {
    const tokyo = validateInjuryTunables({ ...defaults(), timezone: 'Asia/Tokyo' });
    expect(tokyo.ok && tokyo.tunables.timezone).toBe('Asia/Tokyo');
    expectError({ ...defaults(), timezone: 'Mars/Olympus_Mons' }, 'timezone must be a valid IANA time zone');
    expectError({ ...defaults(), timezone: '' }, 'timezone');
    expectError({ ...defaults(), timezone: 5 }, 'timezone');
  });

  it('checks bands, drains and recovery against a changed max stamina', () => {
    expectError({ ...defaults(), maxStamina: 50 }, 'minStamina');
    expectError({ ...defaults(), maxStamina: 0 }, 'maxStamina');
  });
});

describe('isValidTimeZone', () => {
  it('knows Europe/Berlin and UTC, not garbage', () => {
    expect(isValidTimeZone('Europe/Berlin')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });
});
