import { SIM_CATEGORIES, type SimCategory } from '../../constants/simCategories';
import {
  MAX_CHANCE_BANDS,
  MAX_FORMAT_KEY_LENGTH,
  MAX_FORMAT_KEYS,
  MAX_INJURY_MULTIPLIER,
  MAX_INJURY_WEEKS,
  MAX_SEVERITY_WEIGHT,
  MAX_STAMINA_LIMIT,
  type InjurySeverity,
  type InjuryTunables,
  type InjuryTunablesInput,
} from '../../types/injury';

/*
 * The injury settings form (INJ-10). Chances and the sim multipliers are shown
 * as percentages; bands and formats are rows with a stable React key. The
 * checks mirror backend/lib/policies/injuryTunablesValidation.ts so a GM sees
 * each problem next to its field instead of a single 400.
 */

export interface ChanceBandRow {
  rowId: string;
  minStamina: number;
  chancePercent: number;
}

export interface FormatRow {
  rowId: string;
  key: string;
  multiplier: number;
}

export interface InjuryForm {
  maxStamina: number;
  drainByCategory: Record<SimCategory, number>;
  formats: FormatRow[];
  enduranceReductionPercent: number;
  bands: ChanceBandRow[];
  categoryRisk: Record<SimCategory, number>;
  severities: InjurySeverity[];
  lowStaminaSeverityShift: number;
  recoveryMode: 'full' | 'amount';
  recoveryAmount: number;
  timezone: string;
  simStaminaFloorPercent: number;
  simInjuredPenaltyPercent: number;
}

export type InjuryFormProblem =
  | 'integer'
  | 'percent'
  | 'multiplier'
  | 'weight'
  | 'weeks'
  | 'weeksOrder'
  | 'formatKey'
  | 'formatDuplicate'
  | 'formatCount'
  | 'bandsOrder'
  | 'bandsLastZero'
  | 'bandsCount'
  | 'timezone';

export interface InjuryFieldError {
  problem: InjuryFormProblem;
  values?: Record<string, number>;
}

/** Problems keyed by the id of the field they belong to (see `injuryFieldIds`). */
export type InjuryFormErrors = Record<string, InjuryFieldError>;

/** Element ids for each field, shared by the page and the error map. */
export const injuryFieldIds = {
  maxStamina: 'injury-max-stamina',
  drain: (category: SimCategory) => `injury-drain-${category}`,
  formatKey: (rowId: string) => `injury-format-key-${rowId}`,
  formatMultiplier: (rowId: string) => `injury-format-multiplier-${rowId}`,
  formats: 'injury-formats',
  endurance: 'injury-endurance-reduction',
  bandMin: (rowId: string) => `injury-band-min-${rowId}`,
  bandChance: (rowId: string) => `injury-band-chance-${rowId}`,
  bands: 'injury-bands',
  risk: (category: SimCategory) => `injury-risk-${category}`,
  severity: (key: string, field: 'weight' | 'minWeeks' | 'maxWeeks') => `injury-severity-${key}-${field}`,
  shift: 'injury-low-stamina-shift',
  recoveryAmount: 'injury-recovery-amount',
  timezone: 'injury-timezone',
  simFloor: 'injury-sim-floor',
  injuredPenalty: 'injury-sim-injured-penalty',
} as const;

/** Percent ↔ fraction without float noise such as 7.000000000000001. */
export function toPercent(fraction: number): number {
  return Math.round(fraction * 100 * 10_000) / 10_000;
}

export function fromPercent(percent: number): number {
  return Math.round(percent * 10_000) / 1_000_000;
}

export function toInjuryForm(settings: InjuryTunables): InjuryForm {
  return {
    maxStamina: settings.maxStamina,
    drainByCategory: { ...settings.drainByCategory },
    formats: Object.entries(settings.formatMultiplier).map(([key, multiplier]) => ({ rowId: `saved-${key}`, key, multiplier })),
    enduranceReductionPercent: toPercent(settings.enduranceDrainReduction),
    bands: settings.injuryChanceBands.map((band, index) => ({
      rowId: `saved-${index}`,
      minStamina: band.minStamina,
      chancePercent: toPercent(band.chance),
    })),
    categoryRisk: { ...settings.categoryRisk },
    severities: settings.severities.map((severity) => ({ ...severity })),
    lowStaminaSeverityShift: settings.lowStaminaSeverityShift,
    recoveryMode: settings.weeklyRecovery === 'full' ? 'full' : 'amount',
    recoveryAmount: settings.weeklyRecovery === 'full' ? 25 : settings.weeklyRecovery,
    timezone: settings.timezone,
    simStaminaFloorPercent: toPercent(settings.simStaminaFloor),
    simInjuredPenaltyPercent: toPercent(settings.simInjuredPenalty),
  };
}

/** The form as the settings the API takes. Validate first: this does not check. */
export function toInjuryInput(form: InjuryForm): InjuryTunablesInput {
  const formatMultiplier: Record<string, number> = {};
  for (const row of form.formats) formatMultiplier[row.key.trim()] = row.multiplier;
  return {
    maxStamina: form.maxStamina,
    drainByCategory: { ...form.drainByCategory },
    formatMultiplier,
    enduranceDrainReduction: fromPercent(form.enduranceReductionPercent),
    injuryChanceBands: form.bands.map((band) => ({ minStamina: band.minStamina, chance: fromPercent(band.chancePercent) })),
    categoryRisk: { ...form.categoryRisk },
    severities: form.severities.map((severity) => ({ ...severity })),
    lowStaminaSeverityShift: form.lowStaminaSeverityShift,
    weeklyRecovery: form.recoveryMode === 'full' ? 'full' : form.recoveryAmount,
    timezone: form.timezone,
    simStaminaFloor: fromPercent(form.simStaminaFloorPercent),
    simInjuredPenalty: fromPercent(form.simInjuredPenaltyPercent),
  };
}

function isWhole(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

function isPercent(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function isMultiplier(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= MAX_INJURY_MULTIPLIER;
}

/** Every problem on the form, keyed by field id. Empty when the form can be saved. */
export function validateInjuryForm(form: InjuryForm, isKnownTimeZone: (zone: string) => boolean): InjuryFormErrors {
  const errors: InjuryFormErrors = {};
  const whole = (id: string, value: number, min: number, max: number) => {
    if (!isWhole(value, min, max)) errors[id] = { problem: 'integer', values: { min, max } };
  };
  const percent = (id: string, value: number) => {
    if (!isPercent(value)) errors[id] = { problem: 'percent' };
  };
  const multiplier = (id: string, value: number) => {
    if (!isMultiplier(value)) errors[id] = { problem: 'multiplier', values: { max: MAX_INJURY_MULTIPLIER } };
  };

  whole(injuryFieldIds.maxStamina, form.maxStamina, 1, MAX_STAMINA_LIMIT);
  // Fall back to the API limit while max stamina itself is invalid, so one bad box gives one error.
  const staminaCap = isWhole(form.maxStamina, 1, MAX_STAMINA_LIMIT) ? form.maxStamina : MAX_STAMINA_LIMIT;

  for (const category of SIM_CATEGORIES) {
    whole(injuryFieldIds.drain(category), form.drainByCategory[category], 0, staminaCap);
    multiplier(injuryFieldIds.risk(category), form.categoryRisk[category]);
  }

  if (form.formats.length > MAX_FORMAT_KEYS) {
    errors[injuryFieldIds.formats] = { problem: 'formatCount', values: { max: MAX_FORMAT_KEYS } };
  }
  const seenKeys = new Set<string>();
  for (const row of form.formats) {
    const key = row.key.trim();
    if (key.length === 0 || key.length > MAX_FORMAT_KEY_LENGTH) {
      errors[injuryFieldIds.formatKey(row.rowId)] = { problem: 'formatKey', values: { max: MAX_FORMAT_KEY_LENGTH } };
    } else if (seenKeys.has(key)) {
      errors[injuryFieldIds.formatKey(row.rowId)] = { problem: 'formatDuplicate' };
    }
    seenKeys.add(key);
    multiplier(injuryFieldIds.formatMultiplier(row.rowId), row.multiplier);
  }

  percent(injuryFieldIds.endurance, form.enduranceReductionPercent);

  if (form.bands.length === 0 || form.bands.length > MAX_CHANCE_BANDS) {
    errors[injuryFieldIds.bands] = { problem: 'bandsCount', values: { max: MAX_CHANCE_BANDS } };
  }
  form.bands.forEach((band, index) => {
    whole(injuryFieldIds.bandMin(band.rowId), band.minStamina, 0, staminaCap);
    percent(injuryFieldIds.bandChance(band.rowId), band.chancePercent);
    const previous = form.bands[index - 1];
    if (previous && !errors[injuryFieldIds.bandMin(band.rowId)] && band.minStamina >= previous.minStamina) {
      errors[injuryFieldIds.bands] = errors[injuryFieldIds.bands] ?? { problem: 'bandsOrder' };
    }
  });
  const lastBand = form.bands[form.bands.length - 1];
  if (lastBand && lastBand.minStamina !== 0 && !errors[injuryFieldIds.bands]) {
    errors[injuryFieldIds.bands] = { problem: 'bandsLastZero' };
  }

  for (const severity of form.severities) {
    const weightId = injuryFieldIds.severity(severity.key, 'weight');
    if (!(Number.isFinite(severity.weight) && severity.weight > 0 && severity.weight <= MAX_SEVERITY_WEIGHT)) {
      errors[weightId] = { problem: 'weight', values: { max: MAX_SEVERITY_WEIGHT } };
    }
    const minId = injuryFieldIds.severity(severity.key, 'minWeeks');
    const maxId = injuryFieldIds.severity(severity.key, 'maxWeeks');
    const weekLimits = { min: 1, max: MAX_INJURY_WEEKS };
    if (!isWhole(severity.minWeeks, 1, MAX_INJURY_WEEKS)) errors[minId] = { problem: 'weeks', values: weekLimits };
    if (!isWhole(severity.maxWeeks, 1, MAX_INJURY_WEEKS)) errors[maxId] = { problem: 'weeks', values: weekLimits };
    if (!errors[minId] && !errors[maxId] && severity.minWeeks > severity.maxWeeks) {
      errors[maxId] = { problem: 'weeksOrder' };
    }
  }

  whole(injuryFieldIds.shift, form.lowStaminaSeverityShift, 0, staminaCap);
  if (form.recoveryMode === 'amount') whole(injuryFieldIds.recoveryAmount, form.recoveryAmount, 1, staminaCap);
  if (!isKnownTimeZone(form.timezone)) errors[injuryFieldIds.timezone] = { problem: 'timezone' };
  percent(injuryFieldIds.simFloor, form.simStaminaFloorPercent);
  percent(injuryFieldIds.injuredPenalty, form.simInjuredPenaltyPercent);

  return errors;
}

/** True when `zone` is an IANA time zone this browser knows. */
export function isValidTimeZone(zone: string): boolean {
  if (zone.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

type IntlWithSupportedValues = typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] };

/** Every IANA zone the browser lists, plus `current` so a saved zone always shows. */
export function listTimeZones(current: string): string[] {
  const supported = (Intl as IntlWithSupportedValues).supportedValuesOf?.('timeZone') ?? [];
  const zones = new Set(supported);
  if (current) zones.add(current);
  zones.add('UTC');
  return [...zones].sort((left, right) => left.localeCompare(right));
}
