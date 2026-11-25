/**
 * Contracts lifecycle policy (ECO-03). Pure: no I/O, no clock unless passed.
 *
 * State machine:
 *
 *   offered ──accept──▶ active ──last match / season ends──▶ completed
 *      │                   └────────GM releases────────────▶ released
 *      ├──player declines──▶ declined
 *      ├──GM withdraws / another offer accepted──▶ withdrawn
 *      └──offerExpiresAt passes──▶ expired
 *
 * declined, withdrawn, expired, completed and released are terminal.
 */
import type {
  Contract,
  ContractStatus,
  ContractType,
  Player,
} from '../repositories/types';

export const CONTRACT_TYPES: readonly ContractType[] = ['tryout', 'matches', 'season'];

export const CONTRACT_STATUSES: readonly ContractStatus[] = [
  'offered',
  'active',
  'declined',
  'withdrawn',
  'expired',
  'completed',
  'released',
];

const ALLOWED_TRANSITIONS: Readonly<Record<ContractStatus, readonly ContractStatus[]>> = {
  offered: ['active', 'declined', 'withdrawn', 'expired'],
  active: ['completed', 'released'],
  declined: [],
  withdrawn: [],
  expired: [],
  completed: [],
  released: [],
};

/** Statuses a player can still act on or be paid under. */
export const OPEN_CONTRACT_STATUSES: readonly ContractStatus[] = ['offered', 'active'];

export function canTransition(from: ContractStatus, to: ContractStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminalStatus(status: ContractStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

// ─── Offer validation ─────────────────────────────────────────────────

/**
 * The economy settings this policy reads. Kept narrow on purpose so the
 * full `EconomySettings` (ECO-01) satisfies it structurally.
 */
export interface ContractOfferSettings {
  /** Days an offer stays open before it expires. */
  offerExpiryDays: number;
}

/** What a GM submits, after any per-type defaults have been filled in. */
export interface ContractOfferInput {
  playerId: string;
  type: ContractType;
  matchesTotal?: number;
  seasonId?: string;
  perMatchPay: number;
  weeklySalary: number;
  winBonus: number;
  note?: string;
}

export interface ContractOfferContext {
  /** The season that is active right now, if any. Season contracts must name it. */
  activeSeasonId?: string;
  /** Defaults to the current time. */
  now?: Date;
}

export type ContractOfferErrorCode =
  | 'invalidType'
  | 'missingPlayer'
  | 'matchesTotalRequired'
  | 'matchesTotalNotAllowed'
  | 'seasonRequired'
  | 'seasonNotActive'
  | 'seasonNotAllowed'
  | 'invalidAmount'
  | 'noPay'
  | 'tryoutSalaryNotAllowed'
  | 'invalidExpiry';

export interface ContractOfferError {
  code: ContractOfferErrorCode;
  field?: keyof ContractOfferInput | 'offerExpiryDays';
  message: string;
}

/** A validated offer, ready to persist with `status: 'offered'`. */
export interface ValidatedContractOffer extends ContractOfferInput {
  offeredAt: string;
  offerExpiresAt: string;
}

export type ContractOfferValidation =
  | { ok: true; offer: ValidatedContractOffer }
  | { ok: false; errors: ContractOfferError[] };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value >= 1;
}

const AMOUNT_FIELDS = ['perMatchPay', 'weeklySalary', 'winBonus'] as const;

/**
 * Rules:
 * - tryout / matches: `matchesTotal` is an integer ≥ 1; no `seasonId`.
 * - season: `seasonId` names the active season; no `matchesTotal`.
 * - every amount is a non-negative integer.
 * - matches / season: `perMatchPay` or `weeklySalary` is > 0.
 * - tryout: per-match only, so `perMatchPay` > 0 and `weeklySalary` is 0.
 * - `offerExpiryDays` is an integer ≥ 1.
 */
export function validateOffer(
  input: ContractOfferInput,
  settings: ContractOfferSettings,
  context: ContractOfferContext = {},
): ContractOfferValidation {
  const errors: ContractOfferError[] = [];

  if (!input.playerId) {
    errors.push({ code: 'missingPlayer', field: 'playerId', message: 'playerId is required' });
  }

  if (!CONTRACT_TYPES.includes(input.type)) {
    errors.push({ code: 'invalidType', field: 'type', message: `type must be one of ${CONTRACT_TYPES.join(', ')}` });
    return { ok: false, errors };
  }

  if (input.type === 'season') {
    if (input.matchesTotal !== undefined) {
      errors.push({
        code: 'matchesTotalNotAllowed',
        field: 'matchesTotal',
        message: 'A season contract runs until the season ends and has no match count',
      });
    }
    if (!input.seasonId) {
      errors.push({ code: 'seasonRequired', field: 'seasonId', message: 'A season contract needs a seasonId' });
    } else if (input.seasonId !== context.activeSeasonId) {
      errors.push({ code: 'seasonNotActive', field: 'seasonId', message: 'A season contract must be for the active season' });
    }
  } else {
    if (!isPositiveInteger(input.matchesTotal)) {
      errors.push({
        code: 'matchesTotalRequired',
        field: 'matchesTotal',
        message: 'matchesTotal must be a whole number of at least 1',
      });
    }
    if (input.seasonId !== undefined) {
      errors.push({
        code: 'seasonNotAllowed',
        field: 'seasonId',
        message: 'Only season contracts are tied to a season',
      });
    }
  }

  let amountsValid = true;
  for (const field of AMOUNT_FIELDS) {
    if (!isNonNegativeInteger(input[field])) {
      amountsValid = false;
      errors.push({ code: 'invalidAmount', field, message: `${field} must be a whole number of 0 or more` });
    }
  }

  if (amountsValid) {
    if (input.type === 'tryout') {
      if (input.weeklySalary > 0) {
        errors.push({
          code: 'tryoutSalaryNotAllowed',
          field: 'weeklySalary',
          message: 'A tryout is paid per match only',
        });
      }
      if (input.perMatchPay <= 0) {
        errors.push({ code: 'noPay', field: 'perMatchPay', message: 'A tryout needs per-match pay above 0' });
      }
    } else if (input.perMatchPay <= 0 && input.weeklySalary <= 0) {
      errors.push({
        code: 'noPay',
        field: 'perMatchPay',
        message: 'Set per-match pay or a weekly salary above 0',
      });
    }
  }

  if (!isPositiveInteger(settings.offerExpiryDays)) {
    errors.push({
      code: 'invalidExpiry',
      field: 'offerExpiryDays',
      message: 'offerExpiryDays must be a whole number of at least 1',
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  const now = context.now ?? new Date();
  const offer: ValidatedContractOffer = {
    playerId: input.playerId,
    type: input.type,
    ...(input.type !== 'season' && { matchesTotal: input.matchesTotal }),
    ...(input.type === 'season' && { seasonId: input.seasonId }),
    perMatchPay: input.perMatchPay,
    weeklySalary: input.weeklySalary,
    winBonus: input.winBonus,
    ...(input.note !== undefined && { note: input.note }),
    offeredAt: now.toISOString(),
    offerExpiresAt: new Date(now.getTime() + settings.offerExpiryDays * MS_PER_DAY).toISOString(),
  };
  return { ok: true, offer };
}

/** True once `offerExpiresAt` has passed for a still-open offer. */
export function isOfferExpired(
  contract: Pick<Contract, 'status' | 'offerExpiresAt'>,
  now: Date = new Date(),
): boolean {
  return contract.status === 'offered' && Date.parse(contract.offerExpiresAt) <= now.getTime();
}

// ─── Match counting ───────────────────────────────────────────────────

export interface AfterMatchResult {
  matchesPlayed: number;
  /** The contract has now run its course; move it to `completed`. */
  completed: boolean;
}

/**
 * Count one played match against an active contract. Tryout and matches
 * contracts complete when `matchesPlayed` reaches `matchesTotal`; season
 * contracts only end with their season (ECO-06), so never here.
 */
export function afterMatch(
  contract: Pick<Contract, 'type' | 'status' | 'matchesPlayed' | 'matchesTotal'>,
): AfterMatchResult {
  if (contract.status !== 'active') {
    throw new Error(`afterMatch: contract is ${contract.status}, not active`);
  }
  const matchesPlayed = (contract.matchesPlayed ?? 0) + 1;
  const completed = contract.type !== 'season'
    && contract.matchesTotal !== undefined
    && matchesPlayed >= contract.matchesTotal;
  return { matchesPlayed, completed };
}

// ─── Free agency ──────────────────────────────────────────────────────

/** A player is a free agent when no active contract is recorded on them. */
export function isFreeAgent(player: Pick<Player, 'activeContractId'>): boolean {
  return !player.activeContractId;
}
