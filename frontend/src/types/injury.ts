import type { SimCategory } from '../constants/simCategories';

/*
 * Stamina and injury tunables (INJ-01). These types mirror
 * `backend/lib/policies/fatigueDefaults.ts`; keep the two in step.
 */

export const INJURY_SEVERITY_KEYS = ['minor', 'moderate', 'major'] as const;
export type InjurySeverityKey = typeof INJURY_SEVERITY_KEYS[number];

/** Format keys the default multipliers cover. Any other format uses 1. */
export const DEFAULT_FORMAT_KEYS = ['singles', 'tag', 'multiPerson', 'battleRoyal'] as const;

/** Endurance at which drain is neither reduced nor increased (the base build stat). */
export const ENDURANCE_BASELINE = 40;
/** Endurance points above the baseline that give the full `enduranceDrainReduction`. */
export const ENDURANCE_REDUCTION_RANGE = 60;

/** Limits the API enforces (backend/lib/policies/injuryTunablesValidation.ts). */
export const MAX_STAMINA_LIMIT = 1000;
export const MAX_INJURY_MULTIPLIER = 10;
export const MAX_CHANCE_BANDS = 10;
export const MAX_FORMAT_KEYS = 30;
export const MAX_FORMAT_KEY_LENGTH = 40;
export const MAX_INJURY_WEEKS = 52;
export const MAX_SEVERITY_WEIGHT = 1000;

/** Injury chance for anyone whose stamina after the match is at least `minStamina`. */
export interface InjuryChanceBand {
  minStamina: number;
  /** Probability in [0, 1]. */
  chance: number;
}

export interface InjurySeverity {
  key: InjurySeverityKey;
  weight: number;
  minWeeks: number;
  maxWeeks: number;
}

/** The fields a GM edits. */
export interface InjuryTunablesInput {
  maxStamina: number;
  drainByCategory: Record<SimCategory, number>;
  formatMultiplier: Record<string, number>;
  enduranceDrainReduction: number;
  /** Sorted by `minStamina`, highest first; the last band starts at 0. */
  injuryChanceBands: InjuryChanceBand[];
  categoryRisk: Record<SimCategory, number>;
  /** One entry per severity key, mildest first. */
  severities: InjurySeverity[];
  lowStaminaSeverityShift: number;
  weeklyRecovery: number | 'full';
  /** IANA time zone. The league week starts Sunday 00:00 here. */
  timezone: string;
  simStaminaFloor: number;
  simInjuredPenalty: number;
}

export interface InjuryTunables extends InjuryTunablesInput {
  /** 0 until a GM first saves; each save adds 1. */
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

/** One kept version, newest first, as GET /admin/injury-config lists it. */
export interface InjuryTunablesHistoryEntry {
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface InjuryConfigResponse {
  settings: InjuryTunables;
  history: InjuryTunablesHistoryEntry[];
}

// ─── INJ-12: what players see ──────────────────────────────────────

/** A player's injury as anyone may see it (no source, GM note or change log). */
export interface PublicInjury {
  injuryId: string;
  startedAt: string;
  /** The Sunday the player is out until (league time). */
  returnsAt: string;
  severity: InjurySeverityKey;
  weeks: number;
  /** The match it came from, when it came from one. */
  matchId?: string;
  /** Set once the injury is over. */
  endedAt?: string;
}

/** The open injury on a player row. */
export type PublicCurrentInjury = Omit<PublicInjury, 'endedAt'>;

/** The player's next booked match and what it will take from them. */
export interface NextMatchDrain {
  matchId: string;
  date: string;
  drain: number;
  staminaAfter: number;
}

/** GET /players/{playerId}/condition (the player themselves and staff). */
export interface PlayerCondition {
  playerId: string;
  stamina: number;
  maxStamina: number;
  /** Injury-chance band: 0 for the highest stamina, `bandCount - 1` for the lowest. */
  band: number;
  bandCount: number;
  weeklyRecovery: number | 'full';
  /** Next Sunday 00:00 in the league time zone. */
  nextRecoveryAt: string;
  currentInjury: PublicCurrentInjury | null;
  nextMatch: NextMatchDrain | null;
}
