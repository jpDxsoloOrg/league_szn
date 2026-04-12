import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

interface QueuePreferences {
  matchFormat?: string;
  stipulationId?: string;
}

interface QueueRow {
  playerId: string;
  joinedAt: string;
  preferences?: QueuePreferences;
  ttl?: number;
}

interface PlayerRecord {
  playerId: string;
  name?: string;
  currentWrestler?: string;
  imageUrl?: string;
}

interface QueueEntryResponse {
  playerId: string;
  name: string;
  currentWrestler: string;
  imageUrl?: string;
  preferences: QueuePreferences;
  joinedAt: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can view the matchmaking queue');
    }

    // Find the caller's player record via their user sub
    const playerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': auth.sub },
    });

    const callerPlayer = playerResult.Items?.[0];
    if (!callerPlayer) {
      return badRequest('No player profile linked to your account');
    }


    // Fetch all queue rows
    const queueItems = await dynamoDb.scanAll({
      TableName: TableNames.MATCHMAKING_QUEUE,
    });

    const nowSeconds = Math.floor(Date.now() / 1000);

    const activeRows: QueueRow[] = [];
    for (const item of queueItems) {
      const row = item as unknown as QueueRow;
      if (!row.playerId) continue;
      if (typeof row.ttl === 'number' && row.ttl < nowSeconds) continue;
      activeRows.push(row);
    }

    // Hydrate with player records (individual gets; queue is expected to be small)
    const playerResults = await Promise.all(
      activeRows.map((row) =>
        dynamoDb.get({
          TableName: TableNames.PLAYERS,
          Key: { playerId: row.playerId },
        })
      )
    );

    const response: QueueEntryResponse[] = [];
    for (let i = 0; i < activeRows.length; i++) {
      const row = activeRows[i];
      const player = playerResults[i].Item as unknown as PlayerRecord | undefined;
      if (!player || !player.playerId) continue; // skip orphaned rows

      const entry: QueueEntryResponse = {
        playerId: player.playerId,
        name: player.name || '',
        currentWrestler: player.currentWrestler || '',
        preferences: {
          matchFormat: row.preferences?.matchFormat,
          stipulationId: row.preferences?.stipulationId,
        },
        joinedAt: row.joinedAt,
      };
      if (player.imageUrl) {
        entry.imageUrl = player.imageUrl;
      }
      response.push(entry);
    }

    return success(response);
  } catch (err) {
    console.error('Error fetching matchmaking queue:', err);
    return serverError('Failed to fetch matchmaking queue');
  }
};
