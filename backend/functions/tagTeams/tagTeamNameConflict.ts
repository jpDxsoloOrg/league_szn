import type { APIGatewayProxyResult } from 'aws-lambda';
import type { TagTeam } from '../../lib/repositories';
import { errorWithDetails } from '../../lib/response';

/** Names are compared trimmed and case-insensitively, so "new day" clashes with "New Day". */
export function normalizeTagTeamName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * The team in `activeTeams` (other than `exceptTagTeamId`) that already uses
 * `name`. Pass only active teams: a dissolved team's name is free to reuse.
 */
export function findActiveNameClash(
  activeTeams: readonly TagTeam[],
  name: string,
  exceptTagTeamId?: string,
): TagTeam | undefined {
  const normalized = normalizeTagTeamName(name);
  return activeTeams.find((team) =>
    team.tagTeamId !== exceptTagTeamId
    && normalizeTagTeamName(team.name) === normalized);
}

/** 409 TAG_TEAM_NAME_TAKEN, the same shape from create and update. */
export function tagTeamNameTaken(clash: TagTeam): APIGatewayProxyResult {
  return errorWithDetails(
    409,
    `An active tag team is already named "${clash.name}"`,
    { code: 'TAG_TEAM_NAME_TAKEN', conflictingTagTeam: { tagTeamId: clash.tagTeamId, name: clash.name } },
  );
}
