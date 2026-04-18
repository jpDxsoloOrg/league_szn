import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { getRepositories } from '../../lib/repositories';
import type { JoinedOverall } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

interface PlayerRecord {
  playerId: string;
  name: string;
  currentWrestler: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const { overalls } = getRepositories();
    // Note: Players repo not yet migrated (Wave 4), using dynamoDb directly
    const [overallsList, playersResult] = await Promise.all([
      overalls.listAll(),
      dynamoDb.scanAll({ TableName: TableNames.PLAYERS }),
    ]);

    const playersMap = new Map<string, PlayerRecord>(
      (playersResult as unknown as PlayerRecord[]).map((p) => [p.playerId, p])
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
