import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, serverError } from '../../lib/response';
import { tagTeamNamesById } from '../../lib/tagTeams/championTagTeam';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const championshipId = event.pathParameters?.championshipId;

    if (!championshipId) {
      return badRequest('Championship ID is required');
    }

    const { competition: { championships } } = getRepositories();
    const history = await championships.listHistory(championshipId);

    // Tag reigns won by a registered team also carry the team's name (TTC-10).
    const teamNames = await tagTeamNamesById(history.map((reign) => reign.tagTeamId));
    const withTeamNames = history.map((reign) => {
      const tagTeamName = reign.tagTeamId ? teamNames.get(reign.tagTeamId) : undefined;
      return tagTeamName ? { ...reign, tagTeamName } : reign;
    });

    return success(withTeamNames);
  } catch (err) {
    console.error('Error fetching championship history:', err);
    return serverError('Failed to fetch championship history');
  }
};
