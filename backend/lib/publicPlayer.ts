import type { AuthContext } from './auth';
import { computeDiscipline, type PlayerDisciplineSummary } from './discipline';
import { isStaff } from './optionalCaller';
import type { PlayerDeactivation, PlayerEffect, PlayerStrike } from './repositories/types';
import { toPublicCurrentInjury, type CurrentInjury, type PublicCurrentInjury } from './repositories/injuries'; // INJ-03

interface PrivateAccountFields {
  userId?: string;
  canUploadVideos?: boolean;
  hasWrestlerRole?: boolean;
  /** ECO-02: money is private to staff and the player. */
  balance?: number;
  /** ECO-08: bought shop effects, private like the balance. */
  effects?: PlayerEffect[];
  /** ECO-13: which contract is active stays with staff and the player; the public badge comes from GET /players/{id}/contract. */
  activeContractId?: string;
  /** INJ-03: stamina is for staff and the player only. */
  stamina?: number;
}

/**
 * INJ-03: everyone may see that a player is injured and until when; the
 * source and GM note stay with staff.
 */
interface StoredInjuryFields {
  currentInjury?: CurrentInjury;
}

/** Stored discipline state. Never leaves in raw form: readers get `discipline`. */
interface StoredDisciplineFields {
  strikes?: PlayerStrike[];
  deactivations?: PlayerDeactivation[];
  deactivatedAt?: string;
  disciplineVersion?: number;
  signupGuardKey?: string;
}

type PrivatePlayerFields = PrivateAccountFields & StoredDisciplineFields & StoredInjuryFields;

export type PublicPlayer<TPlayer> = Omit<TPlayer, keyof PrivatePlayerFields> & PrivateAccountFields & {
  hasLinkedAccount: boolean;
  discipline?: PlayerDisciplineSummary;
  /** Staff get the stored injury; everyone else the public view. */
  currentInjury?: CurrentInjury | PublicCurrentInjury;
};

export type OwnPlayer<TPlayer> = Omit<TPlayer, keyof StoredDisciplineFields | keyof StoredInjuryFields> & {
  discipline: PlayerDisciplineSummary;
  currentInjury?: PublicCurrentInjury;
};

/**
 * Shape a player row for a public route. The account id and account flags stay
 * with staff and the player themselves; everyone else gets only whether an
 * account is linked, which is what the challenge picker needs. Stored discipline
 * fields are removed for everyone, and the same audience gets the computed summary.
 */
export function toPublicPlayer<TPlayer extends PrivatePlayerFields>(
  player: TPlayer,
  caller: AuthContext | null,
): PublicPlayer<TPlayer> {
  const {
    userId, canUploadVideos, hasWrestlerRole, balance, effects, activeContractId, stamina, currentInjury,
    strikes, deactivatedAt,
    deactivations: _deactivations, disciplineVersion: _disciplineVersion, signupGuardKey: _signupGuardKey,
    ...rest
  } = player;
  const isSelf = Boolean(userId) && caller?.sub === userId;
  const staff = isStaff(caller);
  const mayReadPrivate = staff || isSelf;
  return {
    ...rest,
    hasLinkedAccount: Boolean(userId),
    ...(mayReadPrivate && userId ? { userId } : {}),
    ...(mayReadPrivate && canUploadVideos !== undefined ? { canUploadVideos } : {}),
    ...(mayReadPrivate && hasWrestlerRole !== undefined ? { hasWrestlerRole } : {}),
    ...(mayReadPrivate && balance !== undefined ? { balance } : {}),
    ...(mayReadPrivate && effects !== undefined ? { effects } : {}),
    ...(mayReadPrivate && activeContractId !== undefined ? { activeContractId } : {}),
    ...(mayReadPrivate && stamina !== undefined ? { stamina } : {}),
    ...(currentInjury !== undefined
      ? { currentInjury: staff ? currentInjury : toPublicCurrentInjury(currentInjury) }
      : {}),
    ...(mayReadPrivate ? { discipline: computeDiscipline({ strikes, deactivatedAt }) } : {}),
  };
}

/** Shape a player's own row for `/players/me`, which keeps the account fields (stamina included). */
export function toOwnPlayer<TPlayer extends StoredDisciplineFields & StoredInjuryFields>(player: TPlayer): OwnPlayer<TPlayer> {
  const {
    currentInjury,
    strikes, deactivatedAt,
    deactivations: _deactivations, disciplineVersion: _disciplineVersion, signupGuardKey: _signupGuardKey,
    ...rest
  } = player;
  return {
    ...rest,
    discipline: computeDiscipline({ strikes, deactivatedAt }),
    // INJ-03: the player sees their injury without the GM note.
    ...(currentInjury !== undefined && { currentInjury: toPublicCurrentInjury(currentInjury) }),
  };
}
