import {
  ECONOMY_CONTRACT_TYPES,
  MAX_ECONOMY_AMOUNT,
  MAX_FINE_PRESETS,
  type ContractPayTerms,
  type EconomySettings,
  type EconomySettingsInput,
  type FinePreset,
} from '../../services/api/economy.api';

/** A fine preset row on the form. New rows have no key until they are saved. */
export interface FinePresetRow extends FinePreset {
  /** Stable React key for the row. */
  rowId: string;
}

export type EconomyForm = Omit<EconomySettingsInput, 'finePresets'> & { finePresets: FinePresetRow[] };

/** Why the form can't be saved yet. */
export type EconomyFormProblem = 'currency' | 'amounts' | 'presetLabels' | 'tooManyPresets';

/** Mirrors the API's preset key length limit. */
const MAX_PRESET_KEY_LENGTH = 40;

export function toEconomyForm(settings: EconomySettings): EconomyForm {
  return {
    currencyName: settings.currencyName,
    currencySymbol: settings.currencySymbol,
    contractDefaults: structuredClone(settings.contractDefaults),
    freeAgentWinBonus: settings.freeAgentWinBonus,
    offerExpiryDays: settings.offerExpiryDays,
    noShowFine: settings.noShowFine,
    finePresets: settings.finePresets.map((preset) => ({ ...preset, rowId: `saved-${preset.key}` })),
    shop: structuredClone(settings.shop),
  };
}

/** A preset label as a key: lower case, ASCII letters and digits joined by dashes. */
export function slugifyPresetKey(label: string): string {
  const slug = label
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_PRESET_KEY_LENGTH)
    .replace(/-+$/, '');
  return slug || 'fine';
}

/**
 * The form as the settings the API takes. Saved presets keep their key, so a
 * renamed preset is still the same fine; new ones get a unique key from their
 * label.
 */
export function toEconomyInput(form: EconomyForm): EconomySettingsInput {
  const usedKeys = new Set(form.finePresets.map((preset) => preset.key).filter((key) => key !== ''));
  const finePresets = form.finePresets.map(({ key, label, amount }) => {
    const trimmedLabel = label.trim();
    if (key !== '') return { key, label: trimmedLabel, amount };
    const base = slugifyPresetKey(trimmedLabel);
    let candidate = base;
    for (let suffix = 2; usedKeys.has(candidate); suffix += 1) {
      const ending = `-${suffix}`;
      candidate = `${base.slice(0, MAX_PRESET_KEY_LENGTH - ending.length)}${ending}`;
    }
    usedKeys.add(candidate);
    return { key: candidate, label: trimmedLabel, amount };
  });
  return {
    currencyName: form.currencyName.trim(),
    currencySymbol: form.currencySymbol.trim(),
    contractDefaults: structuredClone(form.contractDefaults),
    freeAgentWinBonus: form.freeAgentWinBonus,
    offerExpiryDays: form.offerExpiryDays,
    noShowFine: form.noShowFine,
    finePresets,
    shop: structuredClone(form.shop),
  };
}

function isWholeNumber(value: number, min: number): boolean {
  return Number.isInteger(value) && value >= min && value <= MAX_ECONOMY_AMOUNT;
}

function payTermsValid(terms: ContractPayTerms): boolean {
  return isWholeNumber(terms.perMatchPay, 0) && isWholeNumber(terms.weeklySalary, 0) && isWholeNumber(terms.winBonus, 0);
}

/** The first thing the API would refuse, or null when the form can be saved. */
export function findEconomyFormProblem(form: EconomyForm): EconomyFormProblem | null {
  if (form.currencyName.trim() === '' || form.currencySymbol.trim() === '') return 'currency';
  if (form.finePresets.length > MAX_FINE_PRESETS) return 'tooManyPresets';
  if (form.finePresets.some((preset) => preset.label.trim() === '')) return 'presetLabels';

  const { contractDefaults, shop } = form;
  const amountsValid = ECONOMY_CONTRACT_TYPES.every((type) => payTermsValid(contractDefaults[type]))
    && isWholeNumber(contractDefaults.tryout.matches, 1)
    && isWholeNumber(form.freeAgentWinBonus, 0)
    && isWholeNumber(form.offerExpiryDays, 1)
    && isWholeNumber(form.noShowFine, 0)
    && form.finePresets.every((preset) => isWholeNumber(preset.amount, 0))
    && isWholeNumber(shop.injuryShield.price, 0)
    && Number.isFinite(shop.injuryShield.chanceReduction)
    && shop.injuryShield.chanceReduction >= 0
    && shop.injuryShield.chanceReduction <= 1
    && isWholeNumber(shop.injuryShield.matches, 1)
    && isWholeNumber(shop.rehab.price, 0)
    && isWholeNumber(shop.rehab.weeksOff, 1)
    && isWholeNumber(shop.staminaTopUp.price, 0)
    && isWholeNumber(shop.staminaTopUp.amount, 0)
    && isWholeNumber(shop.simInterference.price, 0)
    && isWholeNumber(shop.simInterference.ratingBoost, 0)
    && isWholeNumber(shop.gmInterference.price, 0);
  return amountsValid ? null : 'amounts';
}

export interface SeasonBudget {
  salary: number;
  matchPay: number;
  winBonuses: number;
  total: number;
}

/**
 * What a contract pays over `weeks` weeks and `matches` matches with `wins`
 * wins (capped at the match count). Null when any input or term is missing.
 */
export function calculateSeasonBudget(
  terms: ContractPayTerms,
  weeks: number,
  matches: number,
  wins: number,
): SeasonBudget | null {
  const values = [terms.perMatchPay, terms.weeklySalary, terms.winBonus, weeks, matches, wins];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return null;
  const salary = terms.weeklySalary * weeks;
  const matchPay = terms.perMatchPay * matches;
  const winBonuses = terms.winBonus * Math.min(wins, matches);
  return { salary, matchPay, winBonuses, total: salary + matchPay + winBonuses };
}
