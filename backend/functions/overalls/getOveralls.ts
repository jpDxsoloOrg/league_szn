import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

interface OverallRecord {
  playerId: string;
  mainOverall: number;
  alternateOverall?: number;
  submittedAt: string;
  updatedAt: string;
}

interface PlayerRecord {
  playerId: string;
  name: string;
  currentWrestler: string;
}

interface JoinedOverall extends OverallRecord {
  playerName: string;
  wrestlerName: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const [overallsResult, playersResult] = await Promise.all([
      dynamoDb.scanAll({ TableName: TableNames.WRESTLER_OVERALLS }),
      dynamoDb.scanAll({ TableName: TableNames.PLAYERS }),
    ]);

    const playersMap = new Map<string, PlayerRecord>(
      (playersResult as unknown as PlayerRecord[]).map((p) => [p.playerId, p])
    );

    const joined: JoinedOverall[] = (overallsResult as unknown as OverallRecord[]).map((overall) => {
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
