import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

interface TagTeamRecord {
  tagTeamId: string;
  name: string;
  player1Id: string;
  player2Id: string;
  imageUrl?: string;
  status: string;
  wins: number;
  losses: number;
  draws: number;
  createdAt: string;
  updatedAt: string;
  dissolvedAt?: string;
}

interface PlayerRecord {
  playerId: string;
  name: string;
  imageUrl?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const statusFilter = event.queryStringParameters?.status;

    let items: Record<string, unknown>[];

    if (statusFilter) {
      items = await dynamoDb.queryAll({
        TableName: TableNames.TAG_TEAMS,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': statusFilter },
      });
    } else {
      items = await dynamoDb.scanAll({
        TableName: TableNames.TAG_TEAMS,
      });
    }

    const tagTeams = items as unknown as TagTeamRecord[];

    // Collect all unique player IDs
    const playerIds = new Set<string>();
    for (const team of tagTeams) {
      playerIds.add(team.player1Id);
      playerIds.add(team.player2Id);
    }

    // Fetch player details in parallel
    const playerPromises = Array.from(playerIds).map((playerId) =>
      dynamoDb.get({
        TableName: TableNames.PLAYERS,
        Key: { playerId },
        ProjectionExpression: 'playerId, #name, imageUrl',
        ExpressionAttributeNames: { '#name': 'name' },
      })
    );

    const playerResults = await Promise.all(playerPromises);

    // Build player lookup map
    const playerMap = new Map<string, PlayerRecord>();
    for (const result of playerResults) {
      if (result.Item) {
        const player = result.Item as PlayerRecord;
        playerMap.set(player.playerId, player);
      }
    }

    // Enrich tag teams with player names and image URLs
    const enrichedTagTeams = tagTeams.map((team) => {
      const player1 = playerMap.get(team.player1Id);
      const player2 = playerMap.get(team.player2Id);
      return {
        ...team,
        player1Name: player1?.name || 'Unknown',
        player2Name: player2?.name || 'Unknown',
        player1ImageUrl: player1?.imageUrl,
        player2ImageUrl: player2?.imageUrl,
      };
    });

    return success(enrichedTagTeams);
  } catch (err) {
    console.error('Error fetching tag teams:', err);
    return serverError('Failed to fetch tag teams');
  }
};
