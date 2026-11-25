/**
 * League economy settings (ECO-01). Every amount is a placeholder: GMs tune
 * them on the admin economy page without a deploy. Stored in SiteConfig under
 * `economySettings`; a stored row is merged over these defaults on read, so a
 * field added later still has a value.
 *
 * All money amounts are whole numbers of the league currency.
 */

/** Pay terms a contract offer starts from. GMs can override each offer. */
export interface ContractPayTerms {
  /** Paid for every match the wrestler works. */
  perMatchPay: number;
  /** Paid every week the contract is active. */
  weeklySalary: number;
  /** Paid on top of match pay for a win. */
  winBonus: number;
}

/** A tryout runs for a fixed number of matches. */
export interface TryoutContractTerms extends ContractPayTerms {
  matches: number;
}

export interface ContractDefaults {
  tryout: TryoutContractTerms;
  matches: ContractPayTerms;
  season: ContractPayTerms;
}

export const ECONOMY_CONTRACT_TYPES = ['tryout', 'matches', 'season'] as const;
export type EconomyContractType = typeof ECONOMY_CONTRACT_TYPES[number];

/** A one-click fine a GM can hand out, e.g. "Rope-break abuse". */
export interface FinePreset {
  key: string;
  label: string;
  amount: number;
}

export interface InjuryShieldItem {
  enabled: boolean;
  price: number;
  /** Fraction taken off the injury chance, in [0, 1]. */
  chanceReduction: number;
  /** Matches the shield lasts. */
  matches: number;
}

export interface RehabItem {
  enabled: boolean;
  price: number;
  /** Weeks taken off an active injury. */
  weeksOff: number;
}

export interface StaminaTopUpItem {
  enabled: boolean;
  price: number;
  /** Stamina added (capped by the stamina rules). */
  amount: number;
}

export interface SimInterferenceItem {
  enabled: boolean;
  price: number;
  /** Rating boost for the buyer in a simulated match. */
  ratingBoost: number;
}

export interface GmInterferenceItem {
  enabled: boolean;
  price: number;
}

export interface ShopSettings {
  injuryShield: InjuryShieldItem;
  rehab: RehabItem;
  staminaTopUp: StaminaTopUpItem;
  simInterference: SimInterferenceItem;
  gmInterference: GmInterferenceItem;
}

export const SHOP_ITEM_KEYS = [
  'injuryShield',
  'rehab',
  'staminaTopUp',
  'simInterference',
  'gmInterference',
] as const;
export type ShopItemKey = typeof SHOP_ITEM_KEYS[number];

/** The fields a GM edits. */
export interface EconomySettingsInput {
  currencyName: string;
  currencySymbol: string;
  contractDefaults: ContractDefaults;
  /** Paid to a free agent (no contract) for a win. */
  freeAgentWinBonus: number;
  /** Days a contract offer stays open before it expires. */
  offerExpiryDays: number;
  /** Fine for missing a booked match. */
  noShowFine: number;
  finePresets: FinePreset[];
  shop: ShopSettings;
}

export interface EconomySettings extends EconomySettingsInput {
  /** 0 until a GM first saves; each save adds 1. */
  version: number;
  updatedAt: string | null;
  /** Username of the GM who saved this version. */
  updatedBy: string | null;
}

/** How many saved versions SiteConfig keeps, newest first. */
export const ECONOMY_SETTINGS_VERSIONS_KEPT = 20;

export const DEFAULT_ECONOMY_SETTINGS: EconomySettings = {
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
  finePresets: [
    { key: 'cheesy-move-spam', label: 'Cheesy move spam', amount: 100 },
    { key: 'rope-break-abuse', label: 'Rope-break abuse', amount: 100 },
    { key: 'pause-abuse', label: 'Pause abuse', amount: 100 },
  ],
  shop: {
    injuryShield: { enabled: true, price: 300, chanceReduction: 0.5, matches: 3 },
    rehab: { enabled: true, price: 500, weeksOff: 1 },
    staminaTopUp: { enabled: true, price: 150, amount: 20 },
    simInterference: { enabled: true, price: 250, ratingBoost: 5 },
    gmInterference: { enabled: true, price: 1000 },
  },
  version: 0,
  updatedAt: null,
  updatedBy: null,
};

type PlainRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is PlainRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-merges `overlay` onto `base`: nested objects merge key by key, while
 * arrays and scalars in the overlay replace the base value. Keys only in the
 * overlay are kept, so callers validate the result.
 */
export function deepMergeSettings<T>(base: T, overlay: unknown): T {
  if (!isPlainRecord(base) || !isPlainRecord(overlay)) {
    return (overlay === undefined ? base : overlay) as T;
  }
  const merged: PlainRecord = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined) continue;
    merged[key] = key in base ? deepMergeSettings(base[key], value) : value;
  }
  return merged as T;
}

/** A stored row over the defaults, with fresh copies of every nested value. */
export function mergeEconomySettings(stored: Partial<EconomySettings> | undefined): EconomySettings {
  return deepMergeSettings(structuredClone(DEFAULT_ECONOMY_SETTINGS), structuredClone(stored ?? {}));
}

/** The editable fields of a settings object, without the version metadata. */
export function toEconomySettingsInput(settings: EconomySettings): EconomySettingsInput {
  const input: Partial<EconomySettings> = structuredClone(settings);
  delete input.version;
  delete input.updatedAt;
  delete input.updatedBy;
  return input as EconomySettingsInput;
}

/**
 * Adds a saved settings object as the next version on top of `versions`
 * (newest first) and drops anything past ECONOMY_SETTINGS_VERSIONS_KEPT.
 */
export function appendEconomyVersion(
  versions: readonly EconomySettings[],
  input: EconomySettingsInput,
  updatedBy: string,
  now: string,
): EconomySettings[] {
  const currentVersion = versions[0]?.version ?? 0;
  const next: EconomySettings = {
    ...structuredClone(input),
    version: currentVersion + 1,
    updatedAt: now,
    updatedBy,
  };
  return [next, ...versions].slice(0, ECONOMY_SETTINGS_VERSIONS_KEPT);
}
