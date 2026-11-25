/**
 * Stamina and injuries data model (INJ-03).
 *
 * Two places hold injury state:
 * - `Player.currentInjury` (and `Player.stamina`): a denormalized copy of the
 *   open injury, so booking gates and roster reads need no extra query.
 * - The Injuries table (PK `playerId`, SK `startedAt`): one row per injury,
 *   open or ended, with the audit trail of GM edits in `changes[]`.
 *
 * Every write goes through the unit of work so the two stay in step:
 * `tx.putInjury` / `tx.updateInjury` for the rows and
 * `tx.updatePlayerCondition` for the player fields. The repository below only
 * reads.
 *
 * Privacy: stamina is for the player and staff only. Other viewers see an
 * injury's dates, severity, length and match, never the source, notes, who
 * created it or its change log (see `toPublicInjury`).
 */
import { RepositoryError } from './errors';

export type InjurySeverity = 'minor' | 'moderate' | 'major';
export const INJURY_SEVERITIES: readonly InjurySeverity[] = ['minor', 'moderate', 'major'];

/** `match`: rolled from a result (INJ-04). `storyline`: put on by a GM (INJ-08). */
export type InjurySource = 'match' | 'storyline';

/**
 * - `recovered`: the weekly recovery ended it at `returnsAt` (INJ-05).
 * - `healedByGm`: a GM ended it early (INJ-08).
 * - `reverted`: the result it came from was corrected (INJ-04).
 */
export type InjuryEndedReason = 'recovered' | 'healedByGm' | 'reverted';
export const INJURY_ENDED_REASONS: readonly InjuryEndedReason[] = ['recovered', 'healedByGm', 'reverted'];

export function isInjurySeverity(value: unknown): value is InjurySeverity {
  return typeof value === 'string' && (INJURY_SEVERITIES as readonly string[]).includes(value);
}

/**
 * The open injury, copied onto the player row. Same values as the row in the
 * Injuries table; `startedAt` is that row's sort key.
 */
export interface CurrentInjury {
  injuryId: string;
  startedAt: string;
  /** The Sunday recovery boundary the player is out until (exclusive). */
  returnsAt: string;
  severity: InjurySeverity;
  weeks: number;
  matchId?: string;
  source: InjurySource;
  /** Staff only. */
  note?: string;
}

/**
 * One edit to an open injury, appended to `changes[]`. `rehab` is the shop
 * item (ECO-10), bought by the player; every other kind is a GM action.
 */
export type InjuryChangeKind = 'extended' | 'shortened' | 'healed' | 'rehab';

export interface InjuryChange {
  kind: InjuryChangeKind;
  at: string;
  /** Cognito sub of whoever made the change. */
  by: string;
  note?: string;
  returnsAtBefore?: string;
  returnsAtAfter?: string;
  weeksBefore?: number;
  weeksAfter?: number;
}

/** A row in the Injuries table. */
export interface Injury {
  playerId: string;
  /** Sort key. */
  startedAt: string;
  injuryId: string;
  source: InjurySource;
  severity: InjurySeverity;
  weeks: number;
  returnsAt: string;
  /** The match it came from (`source: 'match'`). */
  matchId?: string;
  /** Staff only: why a GM put it on. */
  note?: string;
  /** Staff only: Cognito sub of the GM who created a storyline injury. */
  createdBy?: string;
  /** Set once the injury is over; an open injury has neither field. */
  endedAt?: string;
  endedReason?: InjuryEndedReason;
  /** Staff only: the audit trail. Empty for an injury nobody has edited. */
  changes: InjuryChange[];
}

/**
 * Fields `tx.updateInjury` may change. `endedAt` and `endedReason` go
 * together. `appendChanges` is added to the end of `changes[]`.
 */
export interface InjuryPatch {
  returnsAt?: string;
  weeks?: number;
  severity?: InjurySeverity;
  endedAt?: string;
  endedReason?: InjuryEndedReason;
  appendChanges?: InjuryChange[];
}

/**
 * Player fields `tx.updatePlayerCondition` writes. Omit a field to leave it
 * as it is; `currentInjury: null` clears the injury.
 */
export interface PlayerConditionPatch {
  stamina?: number;
  currentInjury?: CurrentInjury | null;
  // ECO-10
  /** Use up (or count down) one shop effect in the same player write. */
  useEffect?: PlayerEffectUse;
}

// ECO-10
/**
 * Using one entry of `Player.effects` (a shop item). The write fails with
 * `ConcurrencyError('Player', playerId)` unless `effects[index]` is still the
 * effect `effectId` (and, with `matchesLeft`, still has `matchesLeft.before`
 * matches), so an effect is never used twice and a racing write is retried
 * from a fresh read.
 *
 * Without `matchesLeft`, or with `matchesLeft.after` at 0, the effect is
 * removed. Otherwise its `matchesLeft` becomes `after` (an injury shield
 * counting down).
 */
export interface PlayerEffectUse {
  effectId: string;
  /** Position of the effect in `Player.effects` as read. */
  index: number;
  matchesLeft?: { before: number; after: number };
}

/** True when the use removes the effect rather than counting it down. */
export const removesEffect = (use: PlayerEffectUse): boolean =>
  use.matchesLeft === undefined || use.matchesLeft.after <= 0;

/**
 * Optional guard for `tx.updatePlayerCondition`: the write fails with
 * `ConcurrencyError('Player', playerId)` unless the stored values still match.
 * `null` means "not stored" (no stamina yet, or no current injury).
 */
export interface PlayerConditionGuard {
  stamina?: number | null;
  currentInjuryId?: string | null;
}

/** Thrown at staging time (or commit) for a write the store cannot apply. */
export class InvalidInjuryWriteError extends RepositoryError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInjuryWriteError';
  }
}

/** The id `ConcurrencyError('Injury', ...)` carries for a row. */
export const injuryRowId = (playerId: string, startedAt: string): string => `${playerId}/${startedAt}`;

/** The player-row copy of an injury row. */
export function toCurrentInjury(injury: Injury): CurrentInjury {
  return {
    injuryId: injury.injuryId,
    startedAt: injury.startedAt,
    returnsAt: injury.returnsAt,
    severity: injury.severity,
    weeks: injury.weeks,
    source: injury.source,
    ...(injury.matchId !== undefined && { matchId: injury.matchId }),
    ...(injury.note !== undefined && { note: injury.note }),
  };
}

/** Applies a patch to a row (shared by the in-memory store and tests). */
export function applyInjuryPatch(row: Injury, patch: InjuryPatch): Injury {
  const { appendChanges, ...fields } = patch;
  const next: Injury = { ...row, changes: [...(row.changes ?? [])] };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) (next as unknown as Record<string, unknown>)[key] = value;
  }
  if (appendChanges?.length) next.changes.push(...appendChanges.map((change) => ({ ...change })));
  return next;
}

/** Throws for a patch no store should accept. */
export function validateInjuryPatch(patch: InjuryPatch): void {
  if ((patch.endedAt === undefined) !== (patch.endedReason === undefined)) {
    throw new InvalidInjuryWriteError('endedAt and endedReason must be set together');
  }
  if (patch.weeks !== undefined && (!Number.isInteger(patch.weeks) || patch.weeks < 0)) {
    throw new InvalidInjuryWriteError('weeks must be a whole number of at least 0');
  }
}

/** Throws for an injury row no store should accept. */
export function validateInjury(injury: Injury): void {
  if (!injury.playerId || !injury.startedAt || !injury.injuryId) {
    throw new InvalidInjuryWriteError('An injury needs playerId, startedAt and injuryId');
  }
  if (!Number.isInteger(injury.weeks) || injury.weeks < 0) {
    throw new InvalidInjuryWriteError('weeks must be a whole number of at least 0');
  }
  if ((injury.endedAt === undefined) !== (injury.endedReason === undefined)) {
    throw new InvalidInjuryWriteError('endedAt and endedReason must be set together');
  }
}

/** Throws for a condition patch no store should accept. */
export function validatePlayerConditionPatch(patch: PlayerConditionPatch): void {
  if (patch.stamina === undefined && patch.currentInjury === undefined && patch.useEffect === undefined) {
    throw new InvalidInjuryWriteError('A condition write needs stamina, currentInjury or useEffect');
  }
  // ECO-10
  if (patch.useEffect !== undefined) {
    const { effectId, index, matchesLeft } = patch.useEffect;
    if (typeof effectId !== 'string' || effectId === '') {
      throw new InvalidInjuryWriteError('useEffect needs an effectId');
    }
    if (!Number.isInteger(index) || index < 0) {
      throw new InvalidInjuryWriteError('useEffect index must be a whole number of at least 0');
    }
    if (matchesLeft !== undefined && (
      !Number.isInteger(matchesLeft.before) || !Number.isInteger(matchesLeft.after)
      || matchesLeft.after < 0 || matchesLeft.after >= matchesLeft.before
    )) {
      throw new InvalidInjuryWriteError('useEffect matchesLeft must count down by whole numbers');
    }
  }
  if (patch.stamina !== undefined && (!Number.isFinite(patch.stamina) || patch.stamina < 0)) {
    throw new InvalidInjuryWriteError('stamina must be a number of at least 0');
  }
}

// ── Public views ──────────────────────────────────────────────────────

/** What anyone may see of an injury: no source, notes, author or change log. */
export interface PublicInjury {
  injuryId: string;
  startedAt: string;
  returnsAt: string;
  severity: InjurySeverity;
  weeks: number;
  matchId?: string;
  endedAt?: string;
}

/** What anyone may see of a player's current injury. */
export type PublicCurrentInjury = Omit<PublicInjury, 'endedAt'>;

export function toPublicCurrentInjury(injury: CurrentInjury): PublicCurrentInjury {
  return {
    injuryId: injury.injuryId,
    startedAt: injury.startedAt,
    returnsAt: injury.returnsAt,
    severity: injury.severity,
    weeks: injury.weeks,
    ...(injury.matchId !== undefined && { matchId: injury.matchId }),
  };
}

export function toPublicInjury(injury: Injury): PublicInjury {
  return {
    ...toPublicCurrentInjury(injury),
    ...(injury.endedAt !== undefined && { endedAt: injury.endedAt }),
  };
}

/** A player's public history: newest first, without injuries that were reverted. */
export function toPublicInjuryHistory(injuries: readonly Injury[]): PublicInjury[] {
  return injuries.filter((injury) => injury.endedReason !== 'reverted').map(toPublicInjury);
}

/** True once a GM has edited the injury (INJ-04 then leaves it alone on a re-record). */
export function hasGmEdits(injury: Pick<Injury, 'changes'>): boolean {
  return (injury.changes ?? []).some((change) => change.kind !== 'rehab');
}

export interface InjuriesRepository {
  /** One row by its key, or null. */
  get(playerId: string, startedAt: string): Promise<Injury | null>;
  /** One row by injury id, or null. Reads the player's rows. */
  findByInjuryId(playerId: string, injuryId: string): Promise<Injury | null>;
  /** Every injury the player has had, newest first. */
  listByPlayer(playerId: string): Promise<Injury[]>;
  /** Every injury that has not ended, for any player, soonest return first. Scans: fine at league size. */
  listOpen(): Promise<Injury[]>;
}
