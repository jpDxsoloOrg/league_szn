/**
 * Tag team billing per match side (TTB-01).
 *
 * Match payloads only carry players. This module works out, for each side in
 * `match.teams`, which tag team that pair was on the match date, so match
 * cards can bill a side as "The Usos" instead of two names. Resolution is
 * read-time on purpose (see TTC-01): it covers matches booked before tag team
 * billing existed and pairs booked as individuals, and a renamed team shows
 * its current name on old matches.
 */
import { getRepositories } from '../repositories';
import { buildTagTeamIndex, resolveTeamForPair, type TagTeamIndex } from './resolveTagTeams';

/** The tag team a match side was billed as. */
export interface SideTagTeam {
  tagTeamId: string;
  name: string;
  imageUrl?: string;
}

/** The match fields side billing needs. */
export interface SideBillingMatch {
  date: string;
  teams?: string[][];
}

/**
 * Returns one entry per side in `match.teams`, in the same order: the tag
 * team the side's pair formed on the match date, or null for a side that
 * isn't exactly two players of a known team. Returns undefined when the match
 * has no `teams`.
 */
export function resolveSideTagTeams(
  match: SideBillingMatch,
  index: TagTeamIndex,
): (SideTagTeam | null)[] | undefined {
  if (!match.teams || match.teams.length === 0) return undefined;
  return match.teams.map((side) => {
    if (side.length !== 2) return null;
    const team = resolveTeamForPair(index, side[0], side[1], match.date);
    if (!team) return null;
    return {
      tagTeamId: team.tagTeamId,
      name: team.name,
      ...(team.imageUrl ? { imageUrl: team.imageUrl } : {}),
    };
  });
}

/** True when `value` is a list of sides, each a list of player ids. */
export function isTeamsList(value: unknown): value is string[][] {
  return (
    Array.isArray(value) &&
    value.every((side) => Array.isArray(side) && side.every((id) => typeof id === 'string'))
  );
}

/** True when at least one match has sides to bill, so the index is worth loading. */
export function anyMatchHasTeams(matches: readonly { teams?: unknown }[]): boolean {
  return matches.some((match) => isTeamsList(match.teams) && match.teams.length > 0);
}

/**
 * Loads every tag team (dissolved ones included, so old matches resolve) and
 * builds the pair index. Call it once per request. Returns null if the load
 * fails: side billing is decoration, so the caller should still answer
 * without it rather than fail the whole response.
 */
export async function loadTagTeamIndex(): Promise<TagTeamIndex | null> {
  try {
    const teams = await getRepositories().roster.tagTeams.listAll();
    return buildTagTeamIndex(teams);
  } catch (err) {
    console.warn('Side billing: tag team load failed, matches will have no sideTagTeams', err);
    return null;
  }
}

/**
 * `sideTagTeams` for a match payload, as an object to spread into it: empty
 * when there is no index or the match has no valid `teams`.
 */
export function sideTagTeamsField(
  match: { date?: unknown; teams?: unknown },
  index: TagTeamIndex | null,
): { sideTagTeams?: (SideTagTeam | null)[] } {
  if (!index || typeof match.date !== 'string' || !isTeamsList(match.teams)) return {};
  const sideTagTeams = resolveSideTagTeams({ date: match.date, teams: match.teams }, index);
  return sideTagTeams ? { sideTagTeams } : {};
}
