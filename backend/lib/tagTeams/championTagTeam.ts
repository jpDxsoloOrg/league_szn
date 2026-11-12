/**
 * Links tag title reigns to the tag team that holds them (TTC-10).
 *
 * Championships store their holders as player ids. These helpers work out
 * which registered tag team (if any) a pair of champions is, so the title
 * and its history entry can carry a `tagTeamId`.
 */
import { getRepositories } from '../repositories';
import type { TagTeam } from '../repositories/types';
import { buildTagTeamIndex, resolveTeamForPair } from './resolveTagTeams';
import type { TagTeamIndex } from './resolveTagTeams';

/**
 * The tag team id the given champions held the title as on `atDate`, using a
 * prebuilt index. Null unless there are exactly two champions and they formed
 * a team that was active on that date (a random pairing gives null).
 */
export function championTagTeamIdFromIndex(
  index: TagTeamIndex,
  championIds: readonly string[],
  atDate: string,
): string | null {
  if (championIds.length !== 2) return null;
  return resolveTeamForPair(index, championIds[0], championIds[1], atDate)?.tagTeamId ?? null;
}

/** Loads every tag team (all statuses) and builds the pair index. */
export async function loadTagTeamIndex(): Promise<TagTeamIndex> {
  const { roster: { tagTeams } } = getRepositories();
  const teams: TagTeam[] = await tagTeams.listAll();
  return buildTagTeamIndex(teams);
}

/**
 * Resolves the tag team for a pair of champions on `atDate`. Skips the tag
 * team read entirely when there aren't exactly two champions.
 */
export async function resolveChampionTagTeamId(
  championIds: readonly string[],
  atDate: string,
): Promise<string | null> {
  if (championIds.length !== 2) return null;
  const index = await loadTagTeamIndex();
  return championTagTeamIdFromIndex(index, championIds, atDate);
}

/**
 * Names of the given tag teams, keyed by id. Reads nothing when no id is
 * given, so singles-only lists cost no extra query. Missing teams are left out.
 */
export async function tagTeamNamesById(
  tagTeamIds: readonly (string | undefined)[],
): Promise<Map<string, string>> {
  const wanted = new Set(tagTeamIds.filter((id): id is string => typeof id === 'string' && id.length > 0));
  const names = new Map<string, string>();
  if (wanted.size === 0) return names;
  const { roster: { tagTeams } } = getRepositories();
  const teams = await Promise.all([...wanted].map((id) => tagTeams.findById(id)));
  for (const team of teams) {
    if (team) names.set(team.tagTeamId, team.name);
  }
  return names;
}
