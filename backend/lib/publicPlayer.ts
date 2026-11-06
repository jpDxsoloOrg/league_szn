import type { AuthContext } from './auth';
import { isStaff } from './optionalCaller';

interface PrivatePlayerFields {
  userId?: string;
  canUploadVideos?: boolean;
  hasWrestlerRole?: boolean;
}

export type PublicPlayer<TPlayer> = Omit<TPlayer, keyof PrivatePlayerFields> & PrivatePlayerFields & {
  hasLinkedAccount: boolean;
};

/**
 * Shape a player row for a public route. The account id and account flags stay
 * with staff and the player themselves; everyone else gets only whether an
 * account is linked, which is what the challenge picker needs.
 */
export function toPublicPlayer<TPlayer extends PrivatePlayerFields>(
  player: TPlayer,
  caller: AuthContext | null,
): PublicPlayer<TPlayer> {
  const { userId, canUploadVideos, hasWrestlerRole, ...rest } = player;
  const isSelf = Boolean(userId) && caller?.sub === userId;
  const mayReadPrivate = isStaff(caller) || isSelf;
  return {
    ...rest,
    hasLinkedAccount: Boolean(userId),
    ...(mayReadPrivate && userId ? { userId } : {}),
    ...(mayReadPrivate && canUploadVideos !== undefined ? { canUploadVideos } : {}),
    ...(mayReadPrivate && hasWrestlerRole !== undefined ? { hasWrestlerRole } : {}),
  };
}
