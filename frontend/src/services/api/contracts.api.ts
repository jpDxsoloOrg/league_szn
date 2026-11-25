import type { Player } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';
import type { EconomyContractType } from './economy.api';

/*
 * Contracts (ECO-04) and the Admin balance adjustment (ECO-02). These types
 * mirror `backend/lib/repositories/types.ts` and
 * `backend/functions/contracts/contractShared.ts`; keep them in step.
 */

export type ContractType = EconomyContractType;

export const CONTRACT_STATUSES = [
  'offered',
  'active',
  'declined',
  'withdrawn',
  'expired',
  'completed',
  'released',
] as const;
export type ContractStatus = typeof CONTRACT_STATUSES[number];

export type ContractEndReason =
  | 'offerDeclined'
  | 'offerWithdrawn'
  | 'otherOfferAccepted'
  | 'offerExpired'
  | 'matchesCompleted'
  | 'seasonEnded'
  | 'released';

/** A contract or offer with its money, as staff and the player see it. */
export interface Contract {
  contractId: string;
  playerId: string;
  type: ContractType;
  status: ContractStatus;
  /** Set for tryout and match contracts. */
  matchesTotal?: number;
  matchesPlayed: number;
  /** Set for season contracts. */
  seasonId?: string;
  perMatchPay: number;
  weeklySalary: number;
  winBonus: number;
  offeredBy: string;
  offeredAt: string;
  offerExpiresAt: string;
  startedAt?: string;
  endedAt?: string;
  endReason?: ContractEndReason;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/** What anyone may see of a contract: no money, no GM, no notes. */
export interface PublicContract {
  contractId: string;
  playerId: string;
  type: ContractType;
  status: ContractStatus;
  matchesTotal?: number;
  matchesPlayed: number;
  seasonId?: string;
  startedAt?: string;
  endedAt?: string;
}

export interface PlayerContractResponse {
  playerId: string;
  freeAgent: boolean;
  /** The active contract, or null for a free agent. */
  contract: PublicContract | null;
}

/** POST /contracts body. Pay fields left out take the economy defaults for the type. */
export interface ContractOfferRequest {
  playerId: string;
  type: ContractType;
  matchesTotal?: number;
  seasonId?: string;
  perMatchPay?: number;
  weeklySalary?: number;
  winBonus?: number;
  note?: string;
}

/** One rule the server's offer check failed (400 `errors[]`). */
export interface ContractOfferError {
  code: string;
  field?: string;
  message: string;
}

/**
 * A player row from `/players` or `/free-agents`. `balance` is sent only to
 * staff and the player themselves.
 */
export type RosterPlayer = Player & {
  activeContractId?: string;
  balance?: number;
};

export interface ContractListFilter {
  status?: ContractStatus;
  playerId?: string;
  type?: ContractType;
}

export interface BalanceAdjustment {
  /** Non-zero whole number; negative takes money away. */
  amount: number;
  note: string;
  /** Client id so a resend never posts twice. */
  requestId?: string;
}

export interface BalanceAdjustmentResult {
  balance: number;
  alreadyApplied: boolean;
}

// ECO-13: the signed-in player's own contracts and wallet.

/** GET /players/me/contracts. */
export interface MyContractsResponse {
  playerId: string;
  /** Cached ledger balance; may be negative. */
  balance: number;
  activeContract: Contract | null;
  /** Open offers, soonest to expire first. */
  offers: Contract[];
  /** Everything else, newest first. */
  pastContracts: Contract[];
}

export interface AcceptOfferResult {
  contract: Contract;
  /** The player's other open offers, withdrawn by the accept. */
  withdrawnOfferIds: string[];
}

export const LEDGER_ENTRY_KINDS = [
  'perMatchPay',
  'winBonus',
  'salary',
  'fine',
  'fineRescinded',
  'purchase',
  'refund',
  'gmAdjust',
  'reversal',
] as const;
export type LedgerEntryKind = typeof LEDGER_ENTRY_KINDS[number];

/** A ledger entry as its player sees it (mirrors `OwnLedgerEntry` in backend/functions/players/getMyLedger.ts). */
export interface OwnLedgerEntry {
  playerId: string;
  entryId: string;
  createdAt: string;
  sortKey: string;
  kind: LedgerEntryKind;
  /** Signed: positive pays the player. */
  amount: number;
  balanceAfter: number;
  refType?: string;
  refId?: string;
  /** The fine reason or GM note. */
  note?: string;
}

/** GET /players/me/ledger. */
export interface MyLedgerPage {
  playerId: string;
  balance: number;
  /** Newest first. */
  items: OwnLedgerEntry[];
  nextCursor?: string;
}

function queryString(filter: ContractListFilter): string {
  const params = new URLSearchParams();
  if (filter.status) params.set('status', filter.status);
  if (filter.playerId) params.set('playerId', filter.playerId);
  if (filter.type) params.set('type', filter.type);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const contractsApi = {
  /** GET /contracts (Moderator/Admin): contracts and offers with money, newest first. */
  list: async (filter: ContractListFilter = {}, signal?: AbortSignal): Promise<Contract[]> => {
    return fetchWithAuth(`${API_BASE_URL}/contracts${queryString(filter)}`, {}, signal);
  },

  /** POST /contracts (Moderator/Admin): offer a contract to a player. */
  offer: async (offer: ContractOfferRequest): Promise<Contract> => {
    return fetchWithAuth(`${API_BASE_URL}/contracts`, {
      method: 'POST',
      body: JSON.stringify(offer),
    });
  },

  /** POST /contracts/{id}/withdraw (Moderator/Admin): take back an open offer. */
  withdraw: async (contractId: string): Promise<Contract> => {
    return fetchWithAuth(`${API_BASE_URL}/contracts/${encodeURIComponent(contractId)}/withdraw`, {
      method: 'POST',
    });
  },

  /** POST /contracts/{id}/release (Moderator/Admin): end an active contract now. The note is required. */
  release: async (contractId: string, note: string): Promise<Contract> => {
    return fetchWithAuth(`${API_BASE_URL}/contracts/${encodeURIComponent(contractId)}/release`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
  },

  /** GET /players/{id}/contract (public): the contract badge, without money. */
  getPlayerContract: async (playerId: string, signal?: AbortSignal): Promise<PlayerContractResponse> => {
    return fetchWithAuth(`${API_BASE_URL}/players/${encodeURIComponent(playerId)}/contract`, {}, signal);
  },

  /** GET /free-agents (public): visible players with no active contract. */
  getFreeAgents: async (signal?: AbortSignal): Promise<RosterPlayer[]> => {
    return fetchWithAuth(`${API_BASE_URL}/free-agents`, {}, signal);
  },

  // ECO-13: the player's own side.

  /** GET /players/me/contracts: own contract, open offers and history, with money. */
  getMine: async (signal?: AbortSignal): Promise<MyContractsResponse> => {
    return fetchWithAuth(`${API_BASE_URL}/players/me/contracts`, {}, signal);
  },

  /** POST /contracts/{id}/accept (the offered player only). */
  accept: async (contractId: string): Promise<AcceptOfferResult> => {
    return fetchWithAuth(`${API_BASE_URL}/contracts/${encodeURIComponent(contractId)}/accept`, {
      method: 'POST',
    });
  },

  /** POST /contracts/{id}/decline (the offered player only). */
  decline: async (contractId: string): Promise<Contract> => {
    return fetchWithAuth(`${API_BASE_URL}/contracts/${encodeURIComponent(contractId)}/decline`, {
      method: 'POST',
    });
  },

  /** GET /players/me/ledger: own wallet history, newest first. */
  getMyLedger: async (
    options: { cursor?: string; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<MyLedgerPage> => {
    const params = new URLSearchParams();
    if (options.cursor) params.set('cursor', options.cursor);
    if (options.limit) params.set('limit', String(options.limit));
    const query = params.toString();
    return fetchWithAuth(`${API_BASE_URL}/players/me/ledger${query ? `?${query}` : ''}`, {}, signal);
  },

  /** POST /players/{id}/ledger/adjust (Admin): a manual balance correction. */
  adjustBalance: async (playerId: string, adjustment: BalanceAdjustment): Promise<BalanceAdjustmentResult> => {
    return fetchWithAuth(`${API_BASE_URL}/players/${encodeURIComponent(playerId)}/ledger/adjust`, {
      method: 'POST',
      body: JSON.stringify(adjustment),
    });
  },
};
