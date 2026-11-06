import type { AuthContext } from './auth';
import { isStaff } from './optionalCaller';

export type PublicPlayer<TPlayer> = Omit<TPlayer, 'userId'> & {
  userId?: string;
  hasLinkedAccount: boolean;
};

/**
 * Shape a player row for a public route. The account id stays with staff and
 * the player themselves; everyone else gets only whether an account is linked,
 * which is what the challenge picker needs.
 */
export function toPublicPlayer<TPlayer extends { userId?: string }>(
  player: TPlayer,
  caller: AuthContext | null,
): PublicPlayer<TPlayer> {
  const { userId, ...rest } = player;
  const mayReadUserId = Boolean(userId) && (isStaff(caller) || caller?.sub === userId);
  return {
    ...rest,
    hasLinkedAccount: Boolean(userId),
    ...(mayReadUserId ? { userId } : {}),
  };
}
