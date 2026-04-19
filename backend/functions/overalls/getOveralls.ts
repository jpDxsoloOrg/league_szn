import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { JoinedOverall } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const { overalls, players } = getRepositories();
    const [overallsList, playersList] = await Promise.all([
      overalls.listAll(),
      players.list(),
    ]);

    const playersMap = new Map(
      playersList.map((p) => [p.playerId, p])
    );

    const joined: JoinedOverall[] = overallsList.map((overall) => {
      const player = playersMap.get(overall.playerId);
      return {
        ...overall,
        playerName: player?.name ?? 'Unknown Player',
        wrestlerName: player?.currentWrestler ?? 'Unknown Wrestler',
      };
    });

    joined.sort((a, b) => a.playerName.localeCompare(b.playerName));

    return success(joined);
  } catch (err) {
    console.error('Error fetching wrestler overalls:', err);
    return serverError('Failed to fetch wrestler overalls');
  }
};
