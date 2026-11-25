/**
 * Contracts (ECO-03).
 *
 * One row per offer/contract in the Contracts table (PK `contractId`).
 * `PlayerIndex` (playerId + createdAt) lists a player's contracts newest
 * first. Status rules live in `lib/policies/contracts.ts`; this layer only
 * persists. Writes that must move a contract and the player's
 * `activeContractId` together go through the unit of work
 * (`tx.updateContract`, `tx.setPlayerActiveContract`, ...).
 */
import type { Contract, ContractPatch, ContractStatus, ContractType } from './types';

export interface ContractCreateInput {
  playerId: string;
  type: ContractType;
  matchesTotal?: number;
  seasonId?: string;
  perMatchPay: number;
  weeklySalary: number;
  winBonus: number;
  offeredBy: string;
  offeredAt: string;
  offerExpiresAt: string;
  note?: string;
}

export interface ContractListFilter {
  status?: ContractStatus;
  seasonId?: string;
  type?: ContractType;
}

/** Build the row `create` would write, so a unit of work can stage the same shape. */
export function buildContract(contractId: string, input: ContractCreateInput, now: string): Contract {
  return {
    contractId,
    playerId: input.playerId,
    type: input.type,
    status: 'offered',
    ...(input.matchesTotal !== undefined && { matchesTotal: input.matchesTotal }),
    matchesPlayed: 0,
    ...(input.seasonId !== undefined && { seasonId: input.seasonId }),
    perMatchPay: input.perMatchPay,
    weeklySalary: input.weeklySalary,
    winBonus: input.winBonus,
    offeredBy: input.offeredBy,
    offeredAt: input.offeredAt,
    offerExpiresAt: input.offerExpiresAt,
    ...(input.note !== undefined && { note: input.note }),
    createdAt: input.offeredAt,
    updatedAt: now,
  };
}

export interface ContractsRepository {
  findById(contractId: string): Promise<Contract | null>;

  /** Every contract and offer for one player, newest first (PlayerIndex). */
  listByPlayer(playerId: string): Promise<Contract[]>;

  /**
   * Contracts matching every given filter field (all of them when empty),
   * newest first. Scans the table: fine at league size, used by the GM desk
   * and the expiry / season-end sweeps.
   */
  list(filter?: ContractListFilter): Promise<Contract[]>;

  /** Persist a new offer (`status: 'offered'`, `matchesPlayed: 0`). */
  create(input: ContractCreateInput): Promise<Contract>;

  /**
   * Apply `patch`. With `expectedStatus`, the write only lands while the
   * stored status still equals it, otherwise `ConcurrencyError`. Throws
   * `NotFoundError` when the contract does not exist.
   */
  update(contractId: string, patch: ContractPatch, expectedStatus?: ContractStatus): Promise<Contract>;
}
