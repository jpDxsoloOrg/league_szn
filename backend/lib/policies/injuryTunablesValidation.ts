import { SIM_CATEGORIES, type SimCategory } from './buildRules';
import {
  DEFAULT_INJURY_TUNABLES,
  INJURY_SEVERITY_KEYS,
  toInjuryTunablesInput,
  type InjuryChanceBand,
  type InjurySeverity,
  type InjuryTunablesInput,
} from './fatigueDefaults';

/** Highest max stamina a GM can set. */
export const MAX_STAMINA_LIMIT = 1000;
/** Highest drain, risk or format multiplier, so a typo can't wreck the roster. */
const MAX_MULTIPLIER = 10;
const MAX_CHANCE_BANDS = 10;
const MAX_FORMAT_KEYS = 30;
const MAX_FORMAT_KEY_LENGTH = 40;
/** A severity can keep someone out for at most a year. */
export const MAX_INJURY_WEEKS = 52;

export type InjuryTunablesValidationResult =
  | { ok: true; tunables: InjuryTunablesInput }
  | { ok: false; error: string };

type PlainRecord = Record<string, unknown>;

class InjuryTunablesValidationError extends Error {}

function isPlainRecord(value: unknown): value is PlainRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new InjuryTunablesValidationError(message);
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

function expectInteger(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    fail(`${path} must be an integer from ${min} to ${max}`);
  }
  return value;
}

/** A finite number in [min, max]; with `exclusiveMin`, strictly above min. */
function expectNumber(value: unknown, path: string, min: number, max: number, exclusiveMin = false): number {
  const tooLow = typeof value === 'number' && (exclusiveMin ? value <= min : value < min);
  if (typeof value !== 'number' || !Number.isFinite(value) || tooLow || value > max) {
    const lower = exclusiveMin ? `greater than ${min}` : `at least ${min}`;
    fail(`${path} must be a number ${lower} and at most ${max}`);
  }
  return value;
}

function expectChance(value: unknown, path: string): number {
  return expectNumber(value, path, 0, 1);
}

function parseCategoryMap(value: unknown, path: string, parseValue: (entry: unknown, entryPath: string) => number) {
  const map = expectRecord(value, path, SIM_CATEGORIES);
  const parsed = {} as Record<SimCategory, number>;
  for (const category of SIM_CATEGORIES) parsed[category] = parseValue(map[category], `${path}.${category}`);
  return parsed;
}

function parseFormatMultiplier(value: unknown): Record<string, number> {
  if (!isPlainRecord(value)) fail('formatMultiplier must be an object');
  const entries = Object.entries(value);
  if (entries.length > MAX_FORMAT_KEYS) fail(`formatMultiplier can hold at most ${MAX_FORMAT_KEYS} formats`);
  const parsed: Record<string, number> = {};
  for (const [key, multiplier] of entries) {
    const trimmed = key.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_FORMAT_KEY_LENGTH) {
      fail(`formatMultiplier keys must be 1 to ${MAX_FORMAT_KEY_LENGTH} characters`);
    }
    if (trimmed in parsed) fail(`formatMultiplier has "${trimmed}" more than once`);
    parsed[trimmed] = expectNumber(multiplier, `formatMultiplier.${trimmed}`, 0, MAX_MULTIPLIER, true);
  }
  return parsed;
}

function parseChanceBands(value: unknown, maxStamina: number): InjuryChanceBand[] {
  if (!Array.isArray(value) || value.length === 0) fail('injuryChanceBands must be a non-empty array');
  if (value.length > MAX_CHANCE_BANDS) fail(`injuryChanceBands can hold at most ${MAX_CHANCE_BANDS} bands`);
  const bands = value.map((entry: unknown, index: number) => {
    const path = `injuryChanceBands[${index}]`;
    const band = expectRecord(entry, path, ['minStamina', 'chance']);
    return {
      minStamina: expectInteger(band.minStamina, `${path}.minStamina`, 0, maxStamina),
      chance: expectChance(band.chance, `${path}.chance`),
    };
  });
  for (let index = 1; index < bands.length; index++) {
    if (bands[index].minStamina >= bands[index - 1].minStamina) {
      fail('injuryChanceBands must be sorted by minStamina, highest first, with no repeats');
    }
  }
  if (bands[bands.length - 1].minStamina !== 0) {
    fail('The last injury chance band must start at 0 stamina so every stamina has a chance');
  }
  return bands;
}

function parseSeverities(value: unknown): InjurySeverity[] {
  if (!Array.isArray(value) || value.length !== INJURY_SEVERITY_KEYS.length) {
    fail(`severities must list each of: ${INJURY_SEVERITY_KEYS.join(', ')}`);
  }
  const severities = value.map((entry: unknown, index: number) => {
    const path = `severities[${index}]`;
    const severity = expectRecord(entry, path, ['key', 'weight', 'minWeeks', 'maxWeeks']);
    if (severity.key !== INJURY_SEVERITY_KEYS[index]) {
      fail(`${path}.key must be "${INJURY_SEVERITY_KEYS[index]}" (severities go ${INJURY_SEVERITY_KEYS.join(', ')})`);
    }
    const minWeeks = expectInteger(severity.minWeeks, `${path}.minWeeks`, 1, MAX_INJURY_WEEKS);
    const maxWeeks = expectInteger(severity.maxWeeks, `${path}.maxWeeks`, 1, MAX_INJURY_WEEKS);
    if (minWeeks > maxWeeks) fail(`${path}.minWeeks must not be more than maxWeeks`);
    return {
      key: INJURY_SEVERITY_KEYS[index],
      weight: expectNumber(severity.weight, `${path}.weight`, 0, 1_000, true),
      minWeeks,
      maxWeeks,
    };
  });
  return severities;
}

function parseWeeklyRecovery(value: unknown, maxStamina: number): number | 'full' {
  if (value === 'full') return value;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > maxStamina) {
    fail(`weeklyRecovery must be "full" or an integer from 1 to ${maxStamina}`);
  }
  return value;
}

/** True when `timeZone` is an IANA zone this runtime knows. */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const INPUT_KEYS = Object.keys(toInjuryTunablesInput(DEFAULT_INJURY_TUNABLES));

/**
 * Checks a complete tunables object and returns a clean copy (unknown keys
 * rejected). Rules: chances and the sim multipliers are in [0, 1], drains are
 * non-negative, multipliers and severity weights are above 0, chance bands
 * are sorted highest first and end at 0, minWeeks ≤ maxWeeks, and the time
 * zone is a valid IANA zone.
 */
export function validateInjuryTunables(value: unknown): InjuryTunablesValidationResult {
  try {
    const input = expectRecord(value, 'settings', INPUT_KEYS);
    const maxStamina = expectInteger(input.maxStamina, 'maxStamina', 1, MAX_STAMINA_LIMIT);
    const timezone = input.timezone;
    if (!isValidTimeZone(timezone)) fail('timezone must be a valid IANA time zone, e.g. America/New_York');
    return {
      ok: true,
      tunables: {
        maxStamina,
        drainByCategory: parseCategoryMap(input.drainByCategory, 'drainByCategory',
          (entry, path) => expectInteger(entry, path, 0, maxStamina)),
        formatMultiplier: parseFormatMultiplier(input.formatMultiplier),
        enduranceDrainReduction: expectChance(input.enduranceDrainReduction, 'enduranceDrainReduction'),
        injuryChanceBands: parseChanceBands(input.injuryChanceBands, maxStamina),
        categoryRisk: parseCategoryMap(input.categoryRisk, 'categoryRisk',
          (entry, path) => expectNumber(entry, path, 0, MAX_MULTIPLIER, true)),
        severities: parseSeverities(input.severities),
        lowStaminaSeverityShift: expectInteger(input.lowStaminaSeverityShift, 'lowStaminaSeverityShift', 0, maxStamina),
        weeklyRecovery: parseWeeklyRecovery(input.weeklyRecovery, maxStamina),
        timezone: timezone.trim(),
        simStaminaFloor: expectChance(input.simStaminaFloor, 'simStaminaFloor'),
        simInjuredPenalty: expectChance(input.simInjuredPenalty, 'simInjuredPenalty'),
      },
    };
  } catch (error) {
    if (error instanceof InjuryTunablesValidationError) return { ok: false, error: error.message };
    throw error;
  }
}
