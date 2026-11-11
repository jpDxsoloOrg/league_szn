/**
 * Promo.reactions is keyed by each reactor's Cognito id, which would link one
 * account's reactions across promos. Public payloads carry reactionCounts only.
 */
export function withoutReactions<T extends { reactions?: unknown }>(promo: T): Omit<T, 'reactions'> {
  const { reactions, ...rest } = promo;
  void reactions;
  return rest;
}

/** The names of the titles these promos are about. A deleted title has no entry. */
export async function loadChampionshipNames(
  promos: ReadonlyArray<{ championshipId?: string }>,
  findChampionship: (championshipId: string) => Promise<{ name: string } | null>,
): Promise<Map<string, string>> {
  const championshipIds = [...new Set(promos.flatMap((promo) => promo.championshipId ?? []))];
  const championships = await Promise.all(championshipIds.map(findChampionship));
  return new Map(championshipIds.flatMap((championshipId, index) => {
    const championship = championships[index];
    return championship ? [[championshipId, championship.name] as const] : [];
  }));
}
