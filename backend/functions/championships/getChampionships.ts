import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { tagTeamNamesById } from '../../lib/tagTeams/championTagTeam';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { competition: { championships } } = getRepositories();
    const allChampionships = await championships.list();

    // Inactive titles stay listed for admin management and public history,
    // but are excluded by default so scheduling pickers only see active ones.
    const includeInactive = event.queryStringParameters?.includeInactive === 'true';
    const result = includeInactive
      ? allChampionships
      : allChampionships.filter(c => c.isActive !== false);

    // Tag titles held by a registered team also carry the team's name (TTC-10).
    const teamNames = await tagTeamNamesById(result.map((c) => c.currentTagTeamId));
    const withTeamNames = result.map((c) => {
      const currentTagTeamName = c.currentTagTeamId ? teamNames.get(c.currentTagTeamId) : undefined;
      return currentTagTeamName ? { ...c, currentTagTeamName } : c;
    });

    return success(withTeamNames);
  } catch (err) {
    console.error('Error fetching championships:', err);
    return serverError('Failed to fetch championships');
  }
};
