import { API_BASE_URL, fetchWithAuth } from './apiClient';
import type { ShopItemKey } from './economy.api';

/*
 * Shop and GM interference (ECO-08, ECO-09). Types mirror
 * `backend/functions/shop/purchase.ts`, `gmInterference.ts` and
 * `backend/lib/repositories/gmInterference.ts`; keep them in step.
 */

/** Items bought through POST /shop/purchase. GM interference has its own route. */
export type PurchasableItem = Exclude<ShopItemKey, 'gmInterference'>;

/** Why the server refused a purchase or a GM interference request (409 `code`). */
export const SHOP_REFUSAL_CODES = [
  'ITEM_DISABLED',
  'IN_DEBT',
  'INSUFFICIENT_FUNDS',
  'SHIELD_ACTIVE',
  'NO_ACTIVE_INJURY',
  'INJURY_TOO_SHORT',
  'MATCH_NOT_SCHEDULED',
  'NOT_IN_MATCH',
  'BOOST_ALREADY_BOUGHT',
  'REQUEST_PENDING',
  'ALREADY_RESOLVED',
  'OWN_REQUEST',
] as const;
export type ShopRefusalCode = typeof SHOP_REFUSAL_CODES[number];

export function isShopRefusalCode(value: unknown): value is ShopRefusalCode {
  return typeof value === 'string' && (SHOP_REFUSAL_CODES as readonly string[]).includes(value);
}

/** Ledger entry as the API returns it (ECO-02). */
export interface ShopLedgerEntry {
  playerId: string;
  entryId: string;
  createdAt: string;
  kind: string;
  amount: number;
  balanceAfter: number;
  refType?: string;
  refId?: string;
  note?: string;
}

interface PlayerEffectBase {
  effectId: string;
  purchasedAt: string;
  purchaseKey: string;
}

export interface InjuryShieldEffect extends PlayerEffectBase {
  kind: 'injuryShield';
  reduction: number;
  matchesLeft: number;
}

export interface RehabEffect extends PlayerEffectBase {
  kind: 'rehab';
  weeksOff: number;
}

export interface StaminaTopUpEffect extends PlayerEffectBase {
  kind: 'staminaTopUp';
  amount: number;
}

export type PlayerEffect = InjuryShieldEffect | RehabEffect | StaminaTopUpEffect;

/** Money fields `GET /players/me` adds for the player themselves. */
export interface OwnEconomyFields {
  balance?: number;
  effects?: PlayerEffect[];
}

export interface PurchaseResult {
  item: PurchasableItem;
  entry: ShopLedgerEntry;
  balance: number;
  effect?: PlayerEffect;
  simBoost?: { playerId: string; boost: number; purchasedAt: string; matchId: string };
  alreadyApplied: boolean;
}

export type GmInterferenceOutcome = 'delivered' | 'partial' | 'taken' | 'refunded';
export type GmInterferenceStatus = 'pending' | GmInterferenceOutcome;
export const GM_INTERFERENCE_OUTCOMES: readonly GmInterferenceOutcome[] = ['delivered', 'partial', 'taken', 'refunded'];

/** Mirrors GM_INTERFERENCE_REQUEST_MAX_LENGTH. */
export const GM_INTERFERENCE_REQUEST_MAX_LENGTH = 500;
/** Mirrors GM_INTERFERENCE_NOTE_MAX_LENGTH. */
export const GM_INTERFERENCE_NOTE_MAX_LENGTH = 1000;

/** What the player sees of their own request: outcome and public note only. */
export interface PlayerGmInterferenceRequest {
  requestId: string;
  request: string;
  matchId?: string;
  status: GmInterferenceStatus;
  price: number;
  createdAt: string;
  resolvedAt?: string;
  publicNote?: string;
}

/** The GM's view: everything, with the private note and the player's name. */
export interface StaffGmInterferenceRequest extends PlayerGmInterferenceRequest {
  playerId: string;
  playerName?: string;
  privateNote?: string;
  resolvedBy?: string;
  refundEntryId?: string;
  updatedAt: string;
}

export interface GmInterferenceRequestResult {
  request: PlayerGmInterferenceRequest;
  entry: ShopLedgerEntry;
  balance: number;
}

export interface ResolveGmInterferenceInput {
  outcome: GmInterferenceOutcome;
  publicNote?: string;
  privateNote?: string;
}

export const shopApi = {
  /**
   * POST /shop/purchase (the player themselves). `target` is the matchId for
   * sim interference. A resent `requestId` never charges twice. Refusals are
   * 409s with a `code` (see SHOP_REFUSAL_CODES).
   */
  purchase: async (input: { item: PurchasableItem; target?: string; requestId?: string }): Promise<PurchaseResult> => {
    return fetchWithAuth(`${API_BASE_URL}/shop/purchase`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /** POST /shop/gm-interference: pays up front and files the request. */
  requestGmInterference: async (input: { request: string; matchId?: string }): Promise<GmInterferenceRequestResult> => {
    return fetchWithAuth(`${API_BASE_URL}/shop/gm-interference`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /** GET /shop/gm-interference: the caller's own requests, newest first. */
  listMyGmInterference: async (signal?: AbortSignal): Promise<{ requests: PlayerGmInterferenceRequest[] }> => {
    return fetchWithAuth(`${API_BASE_URL}/shop/gm-interference`, {}, signal);
  },
};

export const gmInterferenceApi = {
  /** GET /gm-interference?status= (Admin and Moderator), newest first. */
  list: async (status?: GmInterferenceStatus, signal?: AbortSignal): Promise<{ requests: StaffGmInterferenceRequest[] }> => {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return fetchWithAuth(`${API_BASE_URL}/gm-interference${query}`, {}, signal);
  },

  /** POST /gm-interference/{requestId}/resolve. Only `refunded` returns the money. */
  resolve: async (requestId: string, input: ResolveGmInterferenceInput): Promise<{ request: StaffGmInterferenceRequest }> => {
    return fetchWithAuth(`${API_BASE_URL}/gm-interference/${encodeURIComponent(requestId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};
