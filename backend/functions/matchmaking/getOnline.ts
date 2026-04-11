import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

interface PresenceRow {
  playerId: string;
  lastSeenAt: string;
  ttl?: number;
}

interface QueueRow {
  playerId: string;
  ttl?: number;
}

interface PlayerRecord {
  playerId: string;
  name?: string;
  currentWrestler?: string;
  imageUrl?: string;
}

interface OnlinePlayerResponse {
  playerId: string;
  name: string;
  currentWrestler: string;
  imageUrl?: string;
  lastSeenAt: string;
  inQueue: boolean;
}

const PRESENCE_WINDOW_MS = 3 * 60 * 1000;

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can view online players');
    }

    // Find the caller's player record via their user sub
    const callerPlayerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': auth.sub },
    });

    const callerPlayer = callerPlayerResult.Items?.[0];
    if (!callerPlayer) {
      return badRequest('No player profile linked to your account');
    }

    const callerPlayerId = callerPlayer.playerId as string;

    const [presenceItems, queueItems] = await Promise.all([
      dynamoDb.scanAll({ TableName: TableNames.PRESENCE }),
      dynamoDb.scanAll({ TableName: TableNames.MATCHMAKING_QUEUE }),
    ]);

    const now = Date.now();
    const nowSeconds = Math.floor(now / 1000);
    const cutoff = now - PRESENCE_WINDOW_MS;

    // Build set of players currently in the queue (skip expired rows)
    const inQueueSet = new Set<string>();
    for (const item of queueItems) {
      const row = item as unknown as QueueRow;
      if (!row.playerId) continue;
      if (typeof row.ttl === 'number' && row.ttl < nowSeconds) continue;
      inQueueSet.add(row.playerId);
    }

    // Filter presence rows to those within the 3-minute window, excluding caller
    const livePresence: PresenceRow[] = [];
    for (const item of presenceItems) {
      const row = item as unknown as PresenceRow;
      if (!row.playerId || !row.lastSeenAt) continue;
      if (row.playerId === callerPlayerId) continue;
      const seenAt = Date.parse(row.lastSeenAt);
      if (Number.isNaN(seenAt)) continue;
      if (seenAt <= cutoff) continue;
      livePresence.push(row);
    }

    // Hydrate with player records in parallel
    const playerResults = await Promise.all(
      livePresence.map((row) =>
        dynamoDb.get({
          TableName: TableNames.PLAYERS,
          Key: { playerId: row.playerId },
        })
      )
    );

    const response: OnlinePlayerResponse[] = [];
    for (let i = 0; i < livePresence.length; i++) {
      const presence = livePresence[i];
      const playerItem = playerResults[i].Item as unknown as PlayerRecord | undefined;
      if (!playerItem || !playerItem.playerId) continue;

      const entry: OnlinePlayerResponse = {
        playerId: playerItem.playerId,
        name: playerItem.name || '',
        currentWrestler: playerItem.currentWrestler || '',
        lastSeenAt: presence.lastSeenAt,
        inQueue: inQueueSet.has(playerItem.playerId),
      };
      if (playerItem.imageUrl) {
        entry.imageUrl = playerItem.imageUrl;
      }
      response.push(entry);
    }

    return success(response);
  } catch (err) {
    console.error('Error fetching online players:', err);
    return serverError('Failed to fetch online players');
  }
};
