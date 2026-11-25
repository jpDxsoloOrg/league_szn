import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ECONOMY_SETTINGS,
  ECONOMY_SETTINGS_VERSIONS_KEPT,
  appendEconomyVersion,
  deepMergeSettings,
  mergeEconomySettings,
  toEconomySettingsInput,
  type EconomySettings,
  type EconomySettingsInput,
} from '../economyDefaults';
import { MAX_ECONOMY_AMOUNT, validateEconomySettings } from '../economySettingsValidation';

function defaultsInput(): EconomySettingsInput {
  return toEconomySettingsInput(DEFAULT_ECONOMY_SETTINGS);
}

/** The validation error for the defaults with `patch` merged in. */
function errorFor(patch: unknown): string | undefined {
  const result = validateEconomySettings(deepMergeSettings(defaultsInput(), patch));
  return result.ok ? undefined : result.error;
}

describe('economy defaults', () => {
  it('match the ticket placeholders', () => {
    expect(DEFAULT_ECONOMY_SETTINGS.currencyName).toBe('League Dollars');
    expect(DEFAULT_ECONOMY_SETTINGS.currencySymbol).toBe('$');
    expect(DEFAULT_ECONOMY_SETTINGS.contractDefaults.tryout.matches).toBe(3);
    expect(DEFAULT_ECONOMY_SETTINGS.contractDefaults.tryout.weeklySalary).toBe(0);
    expect(DEFAULT_ECONOMY_SETTINGS.offerExpiryDays).toBe(3);
    expect(DEFAULT_ECONOMY_SETTINGS.shop.rehab.weeksOff).toBe(1);
    expect(DEFAULT_ECONOMY_SETTINGS.version).toBe(0);
  });

  it('pass their own validation', () => {
    expect(validateEconomySettings(defaultsInput())).toEqual({ ok: true, settings: defaultsInput() });
  });
});

describe('mergeEconomySettings', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(mergeEconomySettings(undefined)).toEqual(DEFAULT_ECONOMY_SETTINGS);
  });

  it('fills fields a stored row predates, key by key in nested objects', () => {
    const stored = { currencyName: 'Bucks', shop: { rehab: { price: 9 } } } as unknown as Partial<EconomySettings>;
    const merged = mergeEconomySettings(stored);
    expect(merged.currencyName).toBe('Bucks');
    expect(merged.shop.rehab).toEqual({ enabled: true, price: 9, weeksOff: 1 });
    expect(merged.shop.injuryShield).toEqual(DEFAULT_ECONOMY_SETTINGS.shop.injuryShield);
  });

  it('replaces arrays rather than merging them', () => {
    const merged = mergeEconomySettings({ finePresets: [{ key: 'late', label: 'Late', amount: 5 }] });
    expect(merged.finePresets).toEqual([{ key: 'late', label: 'Late', amount: 5 }]);
  });

  it('never hands out the shared defaults object', () => {
    const merged = mergeEconomySettings(undefined);
    merged.shop.rehab.price = 1;
    merged.finePresets.push({ key: 'x', label: 'X', amount: 1 });
    expect(DEFAULT_ECONOMY_SETTINGS.shop.rehab.price).toBe(500);
    expect(DEFAULT_ECONOMY_SETTINGS.finePresets).toHaveLength(3);
  });
});

describe('validateEconomySettings', () => {
  it.each([
    ['a negative amount', { noShowFine: -1 }, 'noShowFine must be a non-negative integer'],
    ['a fractional amount', { freeAgentWinBonus: 10.5 }, 'freeAgentWinBonus must be a non-negative integer'],
    ['an amount as a string', { shop: { rehab: { price: '10' } } }, 'shop.rehab.price must be a non-negative integer'],
    ['an amount over the cap', { noShowFine: MAX_ECONOMY_AMOUNT + 1 }, `max ${MAX_ECONOMY_AMOUNT}`],
    ['negative contract pay', { contractDefaults: { season: { weeklySalary: -5 } } }, 'contractDefaults.season.weeklySalary'],
    ['a negative preset amount', { finePresets: [{ key: 'a', label: 'A', amount: -1 }] }, 'finePresets[0].amount'],
    ['a zero-match tryout', { contractDefaults: { tryout: { matches: 0 } } }, 'contractDefaults.tryout.matches must be an integer of at least 1'],
    ['a zero-day offer expiry', { offerExpiryDays: 0 }, 'offerExpiryDays must be an integer of at least 1'],
  ])('rejects %s', (_label, patch, message) => {
    expect(errorFor(patch)).toContain(message);
  });

  it('accepts zero amounts', () => {
    expect(errorFor({ noShowFine: 0, shop: { gmInterference: { price: 0 } } })).toBeUndefined();
  });

  it('rejects fine presets with duplicate keys', () => {
    const presets = [
      { key: 'spam', label: 'Spam', amount: 10 },
      { key: 'spam', label: 'Spam again', amount: 20 },
    ];
    expect(errorFor({ finePresets: presets })).toContain('finePresets keys must be unique');
  });

  it('compares preset keys after trimming', () => {
    const presets = [
      { key: 'spam', label: 'Spam', amount: 10 },
      { key: ' spam ', label: 'Spam again', amount: 20 },
    ];
    expect(errorFor({ finePresets: presets })).toContain('unique');
  });

  it('rejects a preset with a blank label or a missing field', () => {
    expect(errorFor({ finePresets: [{ key: 'a', label: '  ', amount: 1 }] })).toContain('finePresets[0].label');
    expect(errorFor({ finePresets: [{ key: 'a', amount: 1 }] })).toContain('finePresets[0].label is required');
  });

  it.each([-0.1, 1.01, Number.NaN])('rejects a shield reduction of %s', (reduction) => {
    expect(errorFor({ shop: { injuryShield: { chanceReduction: reduction } } })).toContain(
      'shop.injuryShield.chanceReduction must be a number between 0 and 1',
    );
  });

  it.each([0, 0.35, 1])('accepts a shield reduction of %s', (reduction) => {
    expect(errorFor({ shop: { injuryShield: { chanceReduction: reduction } } })).toBeUndefined();
  });

  it('rejects unknown keys at any level', () => {
    expect(errorFor({ bonusPool: 5 })).toBe('Unknown setting: settings.bonusPool');
    expect(errorFor({ shop: { jetpack: { price: 1 } } })).toBe('Unknown setting: shop.jetpack');
    expect(errorFor({ shop: { rehab: { weeksOn: 1 } } })).toBe('Unknown setting: shop.rehab.weeksOn');
  });

  it('rejects a non-boolean enabled flag and a blank currency name', () => {
    expect(errorFor({ shop: { staminaTopUp: { enabled: 'yes' } } })).toContain('shop.staminaTopUp.enabled must be a boolean');
    expect(errorFor({ currencyName: '' })).toContain('currencyName must be a non-empty string');
  });

  it('trims text fields in the returned settings', () => {
    const result = validateEconomySettings(deepMergeSettings(defaultsInput(), { currencyName: '  Bucks ' }));
    expect(result.ok && result.settings.currencyName).toBe('Bucks');
  });
});

describe('appendEconomyVersion', () => {
  it('starts at version 1 and stamps who saved it', () => {
    const [saved] = appendEconomyVersion([], defaultsInput(), 'gm1', '2026-11-24T00:00:00.000Z');
    expect(saved).toMatchObject({ version: 1, updatedBy: 'gm1', updatedAt: '2026-11-24T00:00:00.000Z' });
  });

  it('bumps the version on each save and keeps only the newest versions', () => {
    let versions: EconomySettings[] = [];
    for (let save = 1; save <= ECONOMY_SETTINGS_VERSIONS_KEPT + 5; save += 1) {
      versions = appendEconomyVersion(versions, { ...defaultsInput(), noShowFine: save }, 'gm', `t${save}`);
    }
    expect(versions).toHaveLength(ECONOMY_SETTINGS_VERSIONS_KEPT);
    expect(versions[0]).toMatchObject({ version: ECONOMY_SETTINGS_VERSIONS_KEPT + 5, noShowFine: ECONOMY_SETTINGS_VERSIONS_KEPT + 5 });
    expect(versions[versions.length - 1].version).toBe(6);
  });
});
