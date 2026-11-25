/*
 * Injury board, booking gate and condition report shapes (INJ-11). These
 * mirror the backend: `backend/lib/repositories/injuries.ts`,
 * `functions/injuries/listInjuries.ts`, `lib/injuries/bookingGate.ts` and
 * `lib/injuries/scheduledMatchFlags.ts`.
 */
import type { Player } from './index';
import type { InjurySeverityKey } from './injury';

export type InjurySource = 'match' | 'storyline';
export type InjuryEndedReason = 'recovered' | 'healedByGm' | 'reverted';
export type InjuryChangeKind = 'extended' | 'shortened' | 'healed' | 'rehab';

/** The open injury as the player row carries it. Staff get `source` and `note`. */
export interface CurrentInjury {
  injuryId?: string;
  startedAt: string;
  /** The player is out until this instant (exclusive). */
  returnsAt: string;
  severity: InjurySeverityKey;
  weeks: number;
  matchId?: string;
  source?: InjurySource;
  note?: string;
}

/** Condition fields GET /players adds for staff and the player themselves. */
export interface PlayerConditionFields {
  /** Absent means full. */
  stamina?: number;
  currentInjury?: CurrentInjury;
}

export type PlayerWithCondition = Player & PlayerConditionFields;

export interface InjuryChange {
  kind: InjuryChangeKind;
  at: string;
  by: string;
  note?: string;
  returnsAtBefore?: string;
  returnsAtAfter?: string;
  weeksBefore?: number;
  weeksAfter?: number;
}

/** A row in the Injuries table, as staff see it. */
export interface Injury {
  playerId: string;
  startedAt: string;
  injuryId: string;
  source: InjurySource;
  severity: InjurySeverityKey;
  weeks: number;
  returnsAt: string;
  matchId?: string;
  note?: string;
  createdBy?: string;
  endedAt?: string;
  endedReason?: InjuryEndedReason;
  changes: InjuryChange[];
}

export interface InjuryBoardPlayer {
  playerId: string;
  name: string;
  currentWrestler: string;
  imageUrl?: string;
  divisionId?: string;
  stamina?: number;
}

export interface InjuryImpact {
  /** Scheduled matches the player is booked in before they return. */
  scheduledMatchIds: string[];
  /** Names of the active titles the player holds. */
  titles: string[];
}

/** One row of GET /injuries?active=true. */
export interface InjuryBoardEntry {
  injury: Injury;
  /** Null when the player row is gone. */
  player: InjuryBoardPlayer | null;
  pastReturnDate: boolean;
  impact: InjuryImpact;
}

export interface AdjustStaminaResult {
  playerId: string;
  staminaBefore: number | null;
  stamina: number;
}

/** PATCH /players/{id}/injuries/current takes exactly one of these. */
export type UpdateCurrentInjuryInput =
  | { weeks: number; note?: string }
  | { returnsAt: string; note?: string };

/** An injured player a GM booked with `allowInjured: true`. */
export interface InjuryWarning {
  code: 'PLAYER_INJURED';
  playerId: string;
  name: string;
  returnsAt: string;
  message: string;
}

/** Saves that ran the booking gate may carry warnings beside the saved record. */
export interface WithInjuryWarnings {
  injuryWarnings?: InjuryWarning[];
}

/** A participant still injured on a scheduled match's date. */
export interface InjuredParticipant {
  playerId: string;
  returnsAt: string;
}

/** What one result did to one participant's condition. Staff only. */
export interface MatchConditionEntry {
  playerId: string;
  staminaBefore: number;
  staminaAfter: number;
  drain: number;
  chance: number;
  roll: number;
  injuryId?: string;
  severity?: InjurySeverityKey;
  weeks?: number;
  returnsAt?: string;
  alreadyInjured?: boolean;
}

/** Fields INJ-07 and INJ-04 add to match payloads. */
export interface MatchInjuryFields {
  injuredParticipants?: InjuredParticipant[];
  conditionReport?: MatchConditionEntry[];
}
