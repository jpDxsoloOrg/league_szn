import type { ContractOfferRequest, ContractType } from '../../services/api/contracts.api';
import type { EconomySettings } from '../../services/api/economy.api';

/*
 * The contract offer composer's form state (ECO-12). The rules mirror
 * `validateOffer` in `backend/lib/policies/contracts.ts`; the server still
 * checks every offer.
 */

export interface OfferForm {
  type: ContractType;
  /** Tryout and match contracts only. NaN while the box is empty. */
  matchesTotal: number;
  perMatchPay: number;
  weeklySalary: number;
  winBonus: number;
  note: string;
}

export type OfferFormProblem =
  | 'amounts'
  | 'matchesTotal'
  | 'noPay'
  | 'tryoutPay'
  | 'noActiveSeason';

/** Length a match contract starts at; the settings only set the tryout length. */
export const DEFAULT_MATCH_CONTRACT_LENGTH = 5;

export const OFFER_NOTE_MAX_LENGTH = 500;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The form for a type, prefilled from that type's economy defaults. */
export function offerFormFor(type: ContractType, settings: EconomySettings, note = ''): OfferForm {
  const defaults = settings.contractDefaults[type];
  return {
    type,
    matchesTotal: type === 'tryout'
      ? settings.contractDefaults.tryout.matches
      : DEFAULT_MATCH_CONTRACT_LENGTH,
    perMatchPay: defaults.perMatchPay,
    // A tryout pays per match only.
    weeklySalary: type === 'tryout' ? 0 : defaults.weeklySalary,
    winBonus: defaults.winBonus,
    note,
  };
}

function isWholeAmount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/** The first thing stopping the offer, or null when it can be sent. */
export function findOfferProblem(form: OfferForm, activeSeasonId: string | undefined): OfferFormProblem | null {
  if (![form.perMatchPay, form.weeklySalary, form.winBonus].every(isWholeAmount)) return 'amounts';
  if (form.type === 'season') {
    if (!activeSeasonId) return 'noActiveSeason';
  } else if (!Number.isInteger(form.matchesTotal) || form.matchesTotal < 1) {
    return 'matchesTotal';
  }
  if (form.type === 'tryout') {
    if (form.perMatchPay <= 0 || form.weeklySalary !== 0) return 'tryoutPay';
  } else if (form.perMatchPay <= 0 && form.weeklySalary <= 0) {
    return 'noPay';
  }
  return null;
}

/** The POST /contracts body for a valid form. */
export function toOfferRequest(
  playerId: string,
  form: OfferForm,
  activeSeasonId: string | undefined,
): ContractOfferRequest {
  const note = form.note.trim();
  return {
    playerId,
    type: form.type,
    perMatchPay: form.perMatchPay,
    weeklySalary: form.weeklySalary,
    winBonus: form.winBonus,
    ...(form.type === 'season'
      ? (activeSeasonId ? { seasonId: activeSeasonId } : {})
      : { matchesTotal: form.matchesTotal }),
    ...(note ? { note } : {}),
  };
}

/** When an offer made now would expire. */
export function offerExpiryDate(settings: Pick<EconomySettings, 'offerExpiryDays'>, now: Date = new Date()): Date {
  return new Date(now.getTime() + settings.offerExpiryDays * MS_PER_DAY);
}

/** Matches still to play on a tryout or match contract; undefined for a season contract. */
export function matchesLeft(contract: { matchesTotal?: number; matchesPlayed: number }): number | undefined {
  if (contract.matchesTotal === undefined) return undefined;
  return Math.max(0, contract.matchesTotal - contract.matchesPlayed);
}
