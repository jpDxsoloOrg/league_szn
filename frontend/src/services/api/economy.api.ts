import { API_BASE_URL, fetchWithAuth } from './apiClient';

/*
 * League economy settings (ECO-01). These types mirror
 * `backend/lib/policies/economyDefaults.ts`; keep the two in step.
 */

/** Pay terms a contract offer starts from. */
export interface ContractPayTerms {
  perMatchPay: number;
  weeklySalary: number;
  winBonus: number;
}

/** A tryout runs for a fixed number of matches. */
export interface TryoutContractTerms extends ContractPayTerms {
  matches: number;
}

export const ECONOMY_CONTRACT_TYPES = ['tryout', 'matches', 'season'] as const;
export type EconomyContractType = typeof ECONOMY_CONTRACT_TYPES[number];

export interface ContractDefaults {
  tryout: TryoutContractTerms;
  matches: ContractPayTerms;
  season: ContractPayTerms;
}

/** A one-click fine a GM can hand out. */
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
  matches: number;
}

export interface RehabItem {
  enabled: boolean;
  price: number;
  weeksOff: number;
}

export interface StaminaTopUpItem {
  enabled: boolean;
  price: number;
  amount: number;
}

export interface SimInterferenceItem {
  enabled: boolean;
  price: number;
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
  freeAgentWinBonus: number;
  offerExpiryDays: number;
  noShowFine: number;
  finePresets: FinePreset[];
  shop: ShopSettings;
}

export interface EconomySettings extends EconomySettingsInput {
  /** 0 until a GM first saves; each save adds 1. */
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

/** Highest amount the API accepts. Mirrors `MAX_ECONOMY_AMOUNT`. */
export const MAX_ECONOMY_AMOUNT = 1_000_000;
/** Mirrors `MAX_FINE_PRESETS`. */
export const MAX_FINE_PRESETS = 50;

export type CatalogItem = ShopSettings[ShopItemKey] & { key: ShopItemKey };

export interface EconomyCatalog {
  currencyName: string;
  currencySymbol: string;
  version: number;
  /** Enabled shop items only. */
  items: CatalogItem[];
}

export const economyApi = {
  /** GET /admin/economy-config (Admin and Moderator). */
  getConfig: async (signal?: AbortSignal): Promise<{ settings: EconomySettings }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/economy-config`, {}, signal);
  },

  /**
   * PUT /admin/economy-config (Admin only). `settings` may be partial;
   * `finePresets` replaces the whole list. With `expectedVersion`, a save over
   * a newer version fails with a 409.
   */
  updateConfig: async (
    settings: Partial<EconomySettingsInput>,
    expectedVersion?: number,
  ): Promise<{ settings: EconomySettings }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/economy-config`, {
      method: 'PUT',
      body: JSON.stringify({ settings, expectedVersion }),
    });
  },

  /** GET /economy/catalog (public): enabled shop items and prices. */
  getCatalog: async (signal?: AbortSignal): Promise<EconomyCatalog> => {
    return fetchWithAuth(`${API_BASE_URL}/economy/catalog`, {}, signal);
  },
};
