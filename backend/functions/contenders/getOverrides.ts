import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

interface Override {
  championshipId: string;
  playerId: string;
  overrideType: string;
  reason: string;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  active: boolean;
}

interface Player {
  playerId: string;
  name: string;
  currentWrestler: string;
  imageUrl?: string;
}

interface EnrichedOverride extends Override {
  playerName: string;
  wrestlerName: string;
  playerImageUrl: string | null;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const championshipId = event.queryStringParameters?.championshipId;

    let overrides: Override[];

    if (championshipId) {
      // Query by championship using ActiveOverridesIndex GSI
      const result = await dynamoDb.queryAll({
        TableName: TableNames.CONTENDER_OVERRIDES,
        IndexName: 'ActiveOverridesIndex',
        KeyConditionExpression: 'championshipId = :cid',
        FilterExpression: 'active = :active',
        ExpressionAttributeValues: {
          ':cid': championshipId,
          ':active': true,
        },
        ScanIndexForward: false, // newest first
      });
      overrides = result as unknown as Override[];
    } else {
      // Scan all active overrides (admin-only, low volume)
      const result = await dynamoDb.scanAll({
        TableName: TableNames.CONTENDER_OVERRIDES,
        FilterExpression: 'active = :active',
        ExpressionAttributeValues: { ':active': true },
      });
      overrides = result as unknown as Override[];
    }

    // Collect unique player IDs for enrichment
    const playerIds = new Set<string>();
    for (const override of overrides) {
      playerIds.add(override.playerId);
    }

    // Batch-get player details
    const playersMap = new Map<string, Player>();
    for (const playerId of playerIds) {
      const playerResult = await dynamoDb.get({
        TableName: TableNames.PLAYERS,
        Key: { playerId },
      });
      if (playerResult.Item) {
        playersMap.set(playerId, playerResult.Item as unknown as Player);
      }
    }

    // Enrich overrides with player names and sort by createdAt desc
    const enriched: EnrichedOverride[] = overrides
      .map((override) => {
        const player = playersMap.get(override.playerId);
        return {
          ...override,
          playerName: player?.name || 'Unknown',
          wrestlerName: player?.currentWrestler || 'Unknown',
          playerImageUrl: player?.imageUrl || null,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return success(enriched);
  } catch (err) {
    console.error('Error fetching contender overrides:', err);
    return serverError('Failed to fetch contender overrides');
  }
};
