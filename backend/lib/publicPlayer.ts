import type { AuthContext } from './auth';
import { computeDiscipline, type PlayerDisciplineSummary } from './discipline';
import { isStaff } from './optionalCaller';
import type { PlayerDeactivation, PlayerStrike } from './repositories/types';

interface PrivateAccountFields {
  userId?: string;
  canUploadVideos?: boolean;
  hasWrestlerRole?: boolean;
}

/** Stored discipline state. Never leaves in raw form: readers get `discipline`. */
interface StoredDisciplineFields {
  strikes?: PlayerStrike[];
  deactivations?: PlayerDeactivation[];
  deactivatedAt?: string;
  disciplineVersion?: number;
  signupGuardKey?: string;
}

type PrivatePlayerFields = PrivateAccountFields & StoredDisciplineFields;

export type PublicPlayer<TPlayer> = Omit<TPlayer, keyof PrivatePlayerFields> & PrivateAccountFields & {
  hasLinkedAccount: boolean;
  discipline?: PlayerDisciplineSummary;
};

export type OwnPlayer<TPlayer> = Omit<TPlayer, keyof StoredDisciplineFields> & {
  discipline: PlayerDisciplineSummary;
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
    userId, canUploadVideos, hasWrestlerRole,
    strikes, deactivatedAt,
    deactivations: _deactivations, disciplineVersion: _disciplineVersion, signupGuardKey: _signupGuardKey,
    ...rest
  } = player;
  const isSelf = Boolean(userId) && caller?.sub === userId;
  const mayReadPrivate = isStaff(caller) || isSelf;
  return {
    ...rest,
    hasLinkedAccount: Boolean(userId),
    ...(mayReadPrivate && userId ? { userId } : {}),
    ...(mayReadPrivate && canUploadVideos !== undefined ? { canUploadVideos } : {}),
    ...(mayReadPrivate && hasWrestlerRole !== undefined ? { hasWrestlerRole } : {}),
    ...(mayReadPrivate ? { discipline: computeDiscipline({ strikes, deactivatedAt }) } : {}),
  };
}

/** Shape a player's own row for `/players/me`, which keeps the account fields. */
export function toOwnPlayer<TPlayer extends StoredDisciplineFields>(player: TPlayer): OwnPlayer<TPlayer> {
  const {
    strikes, deactivatedAt,
    deactivations: _deactivations, disciplineVersion: _disciplineVersion, signupGuardKey: _signupGuardKey,
    ...rest
  } = player;
  return { ...rest, discipline: computeDiscipline({ strikes, deactivatedAt }) };
}
