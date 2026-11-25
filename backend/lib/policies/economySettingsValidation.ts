import {
  DEFAULT_ECONOMY_SETTINGS,
  ECONOMY_CONTRACT_TYPES,
  SHOP_ITEM_KEYS,
  toEconomySettingsInput,
  type EconomySettingsInput,
} from './economyDefaults';

/** Highest amount a GM can set, so a typo can't mint a fortune. */
export const MAX_ECONOMY_AMOUNT = 1_000_000;
export const MAX_FINE_PRESETS = 50;
const MAX_CURRENCY_NAME_LENGTH = 40;
const MAX_CURRENCY_SYMBOL_LENGTH = 5;
const MAX_PRESET_KEY_LENGTH = 40;
const MAX_PRESET_LABEL_LENGTH = 80;

export type EconomyValidationResult =
  | { ok: true; settings: EconomySettingsInput }
  | { ok: false; error: string };

type PlainRecord = Record<string, unknown>;

class EconomyValidationError extends Error {}

function isPlainRecord(value: unknown): value is PlainRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new EconomyValidationError(message);
}

function expectRecord(value: unknown, path: string, allowedKeys: readonly string[]): PlainRecord {
  if (!isPlainRecord(value)) fail(`${path} must be an object`);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) fail(`Unknown setting: ${path}.${key}`);
  }
  for (const key of allowedKeys) {
    if (!(key in value)) fail(`${path}.${key} is required`);
  }
  return value;
}

/** A whole number from `min` up to MAX_ECONOMY_AMOUNT. */
function expectInteger(value: unknown, path: string, min: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > MAX_ECONOMY_AMOUNT) {
    const floor = min === 0 ? 'a non-negative integer' : `an integer of at least ${min}`;
    fail(`${path} must be ${floor} (max ${MAX_ECONOMY_AMOUNT})`);
  }
  return value;
}

function expectText(value: unknown, path: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${path} must be a non-empty string`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) fail(`${path} must be at most ${maxLength} characters`);
  return trimmed;
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(`${path} must be a boolean`);
  return value;
}

function expectFraction(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    fail(`${path} must be a number between 0 and 1`);
  }
  return value;
}

const PAY_KEYS = ['perMatchPay', 'weeklySalary', 'winBonus'] as const;

function parseContractDefaults(value: unknown): EconomySettingsInput['contractDefaults'] {
  const defaults = expectRecord(value, 'contractDefaults', ECONOMY_CONTRACT_TYPES);
  const payFor = (type: string, terms: PlainRecord) => ({
    perMatchPay: expectInteger(terms.perMatchPay, `contractDefaults.${type}.perMatchPay`, 0),
    weeklySalary: expectInteger(terms.weeklySalary, `contractDefaults.${type}.weeklySalary`, 0),
    winBonus: expectInteger(terms.winBonus, `contractDefaults.${type}.winBonus`, 0),
  });
  const tryout = expectRecord(defaults.tryout, 'contractDefaults.tryout', ['matches', ...PAY_KEYS]);
  const matches = expectRecord(defaults.matches, 'contractDefaults.matches', PAY_KEYS);
  const season = expectRecord(defaults.season, 'contractDefaults.season', PAY_KEYS);
  return {
    tryout: { matches: expectInteger(tryout.matches, 'contractDefaults.tryout.matches', 1), ...payFor('tryout', tryout) },
    matches: payFor('matches', matches),
    season: payFor('season', season),
  };
}

function parseFinePresets(value: unknown): EconomySettingsInput['finePresets'] {
  if (!Array.isArray(value)) fail('finePresets must be an array');
  if (value.length > MAX_FINE_PRESETS) fail(`finePresets can hold at most ${MAX_FINE_PRESETS} presets`);
  const seenKeys = new Set<string>();
  return value.map((entry: unknown, index: number) => {
    const path = `finePresets[${index}]`;
    const preset = expectRecord(entry, path, ['key', 'label', 'amount']);
    const key = expectText(preset.key, `${path}.key`, MAX_PRESET_KEY_LENGTH);
    if (seenKeys.has(key)) fail(`finePresets keys must be unique: "${key}" appears more than once`);
    seenKeys.add(key);
    return {
      key,
      label: expectText(preset.label, `${path}.label`, MAX_PRESET_LABEL_LENGTH),
      amount: expectInteger(preset.amount, `${path}.amount`, 0),
    };
  });
}

function parseShop(value: unknown): EconomySettingsInput['shop'] {
  const shop = expectRecord(value, 'shop', SHOP_ITEM_KEYS);
  const base = (key: string, item: PlainRecord) => ({
    enabled: expectBoolean(item.enabled, `shop.${key}.enabled`),
    price: expectInteger(item.price, `shop.${key}.price`, 0),
  });

  const shield = expectRecord(shop.injuryShield, 'shop.injuryShield', ['enabled', 'price', 'chanceReduction', 'matches']);
  const rehab = expectRecord(shop.rehab, 'shop.rehab', ['enabled', 'price', 'weeksOff']);
  const stamina = expectRecord(shop.staminaTopUp, 'shop.staminaTopUp', ['enabled', 'price', 'amount']);
  const sim = expectRecord(shop.simInterference, 'shop.simInterference', ['enabled', 'price', 'ratingBoost']);
  const gm = expectRecord(shop.gmInterference, 'shop.gmInterference', ['enabled', 'price']);

  return {
    injuryShield: {
      ...base('injuryShield', shield),
      chanceReduction: expectFraction(shield.chanceReduction, 'shop.injuryShield.chanceReduction'),
      matches: expectInteger(shield.matches, 'shop.injuryShield.matches', 1),
    },
    rehab: { ...base('rehab', rehab), weeksOff: expectInteger(rehab.weeksOff, 'shop.rehab.weeksOff', 1) },
    staminaTopUp: { ...base('staminaTopUp', stamina), amount: expectInteger(stamina.amount, 'shop.staminaTopUp.amount', 0) },
    simInterference: {
      ...base('simInterference', sim),
      ratingBoost: expectInteger(sim.ratingBoost, 'shop.simInterference.ratingBoost', 0),
    },
    gmInterference: base('gmInterference', gm),
  };
}

const INPUT_KEYS = Object.keys(toEconomySettingsInput(DEFAULT_ECONOMY_SETTINGS));

/**
 * Checks a complete settings object and returns a clean copy (strings
 * trimmed, unknown keys rejected). Rules: amounts are non-negative integers,
 * counts are at least 1, fine preset keys are unique, and the shield's
 * chance reduction is in [0, 1].
 */
export function validateEconomySettings(value: unknown): EconomyValidationResult {
  try {
    const input = expectRecord(value, 'settings', INPUT_KEYS);
    return {
      ok: true,
      settings: {
        currencyName: expectText(input.currencyName, 'currencyName', MAX_CURRENCY_NAME_LENGTH),
        currencySymbol: expectText(input.currencySymbol, 'currencySymbol', MAX_CURRENCY_SYMBOL_LENGTH),
        contractDefaults: parseContractDefaults(input.contractDefaults),
        freeAgentWinBonus: expectInteger(input.freeAgentWinBonus, 'freeAgentWinBonus', 0),
        offerExpiryDays: expectInteger(input.offerExpiryDays, 'offerExpiryDays', 1),
        noShowFine: expectInteger(input.noShowFine, 'noShowFine', 0),
        finePresets: parseFinePresets(input.finePresets),
        shop: parseShop(input.shop),
      },
    };
  } catch (error) {
    if (error instanceof EconomyValidationError) return { ok: false, error: error.message };
    throw error;
  }
}
