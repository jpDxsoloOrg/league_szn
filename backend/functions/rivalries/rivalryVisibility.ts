import { findHiddenPlayerIds } from '../../lib/needsWrestler';
import type { Rivalry, RivalryStatus } from '../../lib/repositories';

/** Ongoing storylines. Finished rivalries are history and stay listed. */
const ONGOING_STATUSES: ReadonlySet<RivalryStatus> = new Set(['pending', 'active']);

interface RivalryViewer {
  /** Staff keep every rivalry so they can manage it. */
  canSeeAll: boolean;
  callerPlayerId?: string;
}

/**
 * Drops ongoing rivalries with a hidden participant from a public list. The
 * participants themselves keep theirs, so a player who has not set a wrestler
 * name yet can still follow their own storyline.
 */
export async function filterListedRivalries<T extends Pick<Rivalry, 'status' | 'participants'>>(
  rivalries: T[],
  findPlayer: (playerId: string) => Promise<{ currentWrestler?: string | null } | null>,
  { canSeeAll, callerPlayerId }: RivalryViewer,
): Promise<T[]> {
  if (canSeeAll) return rivalries;
  const ongoing = rivalries.filter((rivalry) => ONGOING_STATUSES.has(rivalry.status));
  const hiddenIds = await findHiddenPlayerIds(
    ongoing.flatMap((rivalry) => rivalry.participants.map((participant) => participant.playerId)),
    findPlayer,
  );
  if (hiddenIds.size === 0) return rivalries;
  return rivalries.filter((rivalry) => {
    if (!ONGOING_STATUSES.has(rivalry.status)) return true;
    const ids = rivalry.participants.map((participant) => participant.playerId);
    return !ids.some((id) => hiddenIds.has(id)) || ids.includes(callerPlayerId ?? '');
  });
}
