/**
 * Promo.reactions is keyed by each reactor's Cognito id, which would link one
 * account's reactions across promos. Public payloads carry reactionCounts only.
 */
export function withoutReactions<T extends { reactions?: unknown }>(promo: T): Omit<T, 'reactions'> {
  const { reactions, ...rest } = promo;
  void reactions;
  return rest;
}
