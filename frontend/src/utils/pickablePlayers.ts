import type { DisciplineStatus } from '../types';
import { isNeedsWrestler } from './needsWrestler';

interface RosterPlayer {
  playerId: string;
  currentWrestler?: string | null;
  discipline?: { status: DisciplineStatus } | null;
}

interface TagTeamMembers {
  player1Id: string;
  player2Id: string;
}

/**
 * Who a staff picker may offer: players with a wrestler who are not deactivated,
 * plus `keepIds`, the people already on the record being viewed. A hidden player
 * who is already booked stays, so editing an old record does not drop them on
 * save. Pass the full staff roster, and keep using that roster to resolve names
 * on old records.
 */
export function pickablePlayers<T extends RosterPlayer>(
  players: readonly T[],
  keepIds: Iterable<string> = [],
): T[] {
  const kept = new Set(keepIds);
  return players.filter((player) => (
    kept.has(player.playerId)
    || (!isNeedsWrestler(player.currentWrestler) && player.discipline?.status !== 'deactivated')
  ));
}

/** Tag teams a picker may offer: picking one must not book a hidden member. */
export function pickableTagTeams<T extends TagTeamMembers>(
  tagTeams: readonly T[],
  players: readonly RosterPlayer[],
  keepIds: Iterable<string> = [],
): T[] {
  const pickableIds = new Set(pickablePlayers(players, keepIds).map((player) => player.playerId));
  const unpickableIds = new Set(
    players.map((player) => player.playerId).filter((playerId) => !pickableIds.has(playerId)),
  );
  return tagTeams.filter((team) => !unpickableIds.has(team.player1Id) && !unpickableIds.has(team.player2Id));
}
