import type { Stable } from '../../types/stable';

/**
 * Activity feed entry, derived client-side from the factions list because
 * there is no activity endpoint yet.
 */
export interface DerivedFactionActivityItem {
  id: string;
  kind: 'formed' | 'disbanded';
  /** ISO timestamp used for sort and display. */
  timestamp: string;
  factionId: string;
  factionName: string;
  imageUrl?: string;
}

/** A "formed" entry per faction, plus a "disbanded" entry when one applies. */
export function deriveFactionActivity(
  factions: ReadonlyArray<Stable>,
  max: number = 8,
): DerivedFactionActivityItem[] {
  const items: DerivedFactionActivityItem[] = [];

  for (const faction of factions) {
    const shared = {
      factionId: faction.stableId,
      factionName: faction.name,
      imageUrl: faction.imageUrl,
    };
    if (faction.createdAt) {
      items.push({ ...shared, id: `formed-${faction.stableId}`, kind: 'formed', timestamp: faction.createdAt });
    }
    if (faction.status === 'disbanded' && faction.disbandedAt) {
      items.push({ ...shared, id: `disbanded-${faction.stableId}`, kind: 'disbanded', timestamp: faction.disbandedAt });
    }
  }

  items.sort((first, second) => (second.timestamp || '').localeCompare(first.timestamp || ''));
  return items.slice(0, max);
}
