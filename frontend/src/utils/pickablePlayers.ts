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

export interface TagTeamPickerOption<T> {
  team: T;
  /** Members hidden from booking; the team can't be picked while this is above 0. */
  unavailableMemberCount: number;
}

/**
 * Every tag team for a booking picker, with how many of its members are hidden.
 * Unlike `pickableTagTeams`, a team with a hidden member stays in the list, so
 * the picker can show it as unavailable instead of dropping it silently.
 */
export function tagTeamPickerOptions<T extends TagTeamMembers>(
  tagTeams: readonly T[],
  players: readonly RosterPlayer[],
  keepIds: Iterable<string> = [],
): TagTeamPickerOption<T>[] {
  const pickableIds = new Set(pickablePlayers(players, keepIds).map((player) => player.playerId));
  const unpickableIds = new Set(
    players.map((player) => player.playerId).filter((playerId) => !pickableIds.has(playerId)),
  );
  return tagTeams.map((team) => ({
    team,
    unavailableMemberCount: [team.player1Id, team.player2Id].filter((playerId) => unpickableIds.has(playerId)).length,
  }));
}
