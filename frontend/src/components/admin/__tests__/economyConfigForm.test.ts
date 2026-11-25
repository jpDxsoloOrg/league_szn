import { describe, it, expect } from 'vitest';
import type { EconomySettings } from '../../../services/api/economy.api';
import {
  calculateSeasonBudget,
  findEconomyFormProblem,
  slugifyPresetKey,
  toEconomyForm,
  toEconomyInput,
} from '../economyConfigForm';

const SETTINGS: EconomySettings = {
  currencyName: 'League Dollars',
  currencySymbol: '$',
  contractDefaults: {
    tryout: { matches: 3, perMatchPay: 100, weeklySalary: 0, winBonus: 50 },
    matches: { perMatchPay: 150, weeklySalary: 0, winBonus: 75 },
    season: { perMatchPay: 100, weeklySalary: 250, winBonus: 100 },
  },
  freeAgentWinBonus: 50,
  offerExpiryDays: 3,
  noShowFine: 250,
  finePresets: [{ key: 'pause-abuse', label: 'Pause abuse', amount: 100 }],
  shop: {
    injuryShield: { enabled: true, price: 300, chanceReduction: 0.5, matches: 3 },
    rehab: { enabled: true, price: 500, weeksOff: 1 },
    staminaTopUp: { enabled: true, price: 150, amount: 20 },
    simInterference: { enabled: true, price: 250, ratingBoost: 5 },
    gmInterference: { enabled: false, price: 1000 },
  },
  version: 4,
  updatedAt: '2026-11-20T10:00:00.000Z',
  updatedBy: 'gm',
};

describe('slugifyPresetKey', () => {
  it('turns a label into a dashed ASCII key', () => {
    expect(slugifyPresetKey('  Rope-break Abuse!! ')).toBe('rope-break-abuse');
    expect(slugifyPresetKey('Übermäßiges Pausieren')).toBe('ubermassiges-pausieren');
  });

  it('falls back when nothing usable is left', () => {
    expect(slugifyPresetKey('???')).toBe('fine');
  });

  it('keeps keys within 40 characters', () => {
    expect(slugifyPresetKey('a'.repeat(60)).length).toBe(40);
  });
});

describe('toEconomyInput', () => {
  it('keeps saved preset keys when the label changes and drops version metadata', () => {
    const form = toEconomyForm(SETTINGS);
    form.finePresets[0].label = '  Pausing too much ';
    const input = toEconomyInput(form);
    expect(input.finePresets).toEqual([{ key: 'pause-abuse', label: 'Pausing too much', amount: 100 }]);
    expect(input).not.toHaveProperty('version');
    expect(input).not.toHaveProperty('updatedBy');
  });

  it('gives new presets unique keys from their labels', () => {
    const form = toEconomyForm(SETTINGS);
    form.finePresets.push(
      { rowId: 'new-1', key: '', label: 'Pause abuse', amount: 50 },
      { rowId: 'new-2', key: '', label: 'Pause abuse', amount: 75 },
    );
    expect(toEconomyInput(form).finePresets.map((preset) => preset.key)).toEqual([
      'pause-abuse',
      'pause-abuse-2',
      'pause-abuse-3',
    ]);
  });
});

describe('findEconomyFormProblem', () => {
  it('accepts the saved settings', () => {
    expect(findEconomyFormProblem(toEconomyForm(SETTINGS))).toBeNull();
  });

  it('flags a blank currency', () => {
    const form = toEconomyForm(SETTINGS);
    form.currencySymbol = ' ';
    expect(findEconomyFormProblem(form)).toBe('currency');
  });

  it('flags an empty, fractional or negative amount', () => {
    for (const value of [Number.NaN, 1.5, -1]) {
      const form = toEconomyForm(SETTINGS);
      form.contractDefaults.season.winBonus = value;
      expect(findEconomyFormProblem(form)).toBe('amounts');
    }
  });

  it('needs counts of at least 1 and a shield reduction up to 100%', () => {
    const noExpiry = toEconomyForm(SETTINGS);
    noExpiry.offerExpiryDays = 0;
    expect(findEconomyFormProblem(noExpiry)).toBe('amounts');

    const fullShield = toEconomyForm(SETTINGS);
    fullShield.shop.injuryShield.chanceReduction = 1;
    expect(findEconomyFormProblem(fullShield)).toBeNull();
    fullShield.shop.injuryShield.chanceReduction = 1.1;
    expect(findEconomyFormProblem(fullShield)).toBe('amounts');
  });

  it('flags a preset without a label', () => {
    const form = toEconomyForm(SETTINGS);
    form.finePresets.push({ rowId: 'new-1', key: '', label: '  ', amount: 10 });
    expect(findEconomyFormProblem(form)).toBe('presetLabels');
  });
});

describe('calculateSeasonBudget', () => {
  it('adds salary, match pay and win bonuses', () => {
    expect(calculateSeasonBudget(SETTINGS.contractDefaults.season, 10, 8, 5)).toEqual({
      salary: 2500,
      matchPay: 800,
      winBonuses: 500,
      total: 3800,
    });
  });

  it('caps wins at the match count', () => {
    expect(calculateSeasonBudget(SETTINGS.contractDefaults.season, 0, 2, 5)?.winBonuses).toBe(200);
  });

  it('returns null while an input is empty', () => {
    expect(calculateSeasonBudget(SETTINGS.contractDefaults.season, Number.NaN, 8, 5)).toBeNull();
  });
});
