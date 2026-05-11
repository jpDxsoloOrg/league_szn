import type { Player } from '../../types';
import type { Stable } from '../../types/stable';

/**
 * Right-rail activity feed entry on the redesigned Factions Hub.
 *
 * v1 derives entries client-side from the data the hub already loads —
 * the dedicated `factionsApi.getActivity` endpoint doesn't exist yet.
 * When it does, swap the call site and keep this shape stable.
 */
export interface DerivedFactionActivityItem {
  id: string;
  /** ISO timestamp used for sort and display. */
  timestamp: string;
  /** Short, human-readable sentence — e.g. "The Brood was formed". */
  summary: string;
  factionId: string;
  factionName: string;
  /**
   * Player who triggered the event when one can be determined (faction
   * leader for formation/disbandment). Undefined when the data doesn't
   * map cleanly to a single actor.
   */
  actorPlayerId?: string;
  actorPlayerName?: string;
  actorImageUrl?: string;
}

/**
 * Build the activity feed from the factions list. Each faction surfaces
 * a "was formed" entry, plus a "was disbanded" entry when applicable.
 * Future enhancements (member joins, recent wins) can append more items
 * to the same array before the sort.
 */
export function deriveFactionActivity(
  factions: ReadonlyArray<Stable>,
  playerById: ReadonlyMap<string, Player>,
  max: number = 8,
): DerivedFactionActivityItem[] {
  const items: DerivedFactionActivityItem[] = [];

  for (const faction of factions) {
    const leader = playerById.get(faction.leaderId);

    if (faction.createdAt) {
      items.push({
        id: `formed-${faction.stableId}`,
        timestamp: faction.createdAt,
        summary: `${faction.name} was formed`,
        factionId: faction.stableId,
        factionName: faction.name,
        actorPlayerId: leader?.playerId,
        actorPlayerName: leader?.name,
        actorImageUrl: leader?.imageUrl,
      });
    }

    if (faction.status === 'disbanded' && faction.disbandedAt) {
      items.push({
        id: `disbanded-${faction.stableId}`,
        timestamp: faction.disbandedAt,
        summary: `${faction.name} was disbanded`,
        factionId: faction.stableId,
        factionName: faction.name,
        actorPlayerId: leader?.playerId,
        actorPlayerName: leader?.name,
        actorImageUrl: leader?.imageUrl,
      });
    }
  }

  items.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  return items.slice(0, max);
}
