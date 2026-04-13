import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

interface JoinQueueBody {
  matchFormat?: string;
  stipulationId?: string;
  expiresInMinutes?: number;
  championshipId?: string;
}

interface QueuePreferences {
  matchFormat?: string;
  stipulationId?: string;
}

interface QueueRow {
  playerId: string;
  joinedAt: string;
  preferences?: QueuePreferences;
  ttl: number;
}

interface PresenceRow {
  playerId: string;
  ttl?: number;
}

interface PlayerRecord {
  playerId: string;
  name: string;
  userId?: string;
}

const DEFAULT_EXPIRES_IN_MINUTES = 15;

/**
 * POST /matchmaking/queue/join
 *
 * Wrestlers opt-in to the matchmaking queue. The caller's row is inserted with
 * a TTL — no auto-pairing happens here. Other wrestlers see this row and can
 * issue a manual challenge (invitation) to start a match. Championship matches
 * are NOT allowed through this flow.
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can join the matchmaking queue');
    }

    const { data: body, error: parseError } = parseBody<JoinQueueBody>(event);
    if (parseError) return parseError;

    if (body.championshipId !== undefined) {
      return badRequest(
        'Championship matches cannot be scheduled via matchmaking. Use the challenge or admin scheduling flow.'
      );
    }

    const matchFormat = body.matchFormat;
    const stipulationId = body.stipulationId;
    const expiresInMinutes =
      typeof body.expiresInMinutes === 'number' && body.expiresInMinutes > 0
        ? body.expiresInMinutes
        : DEFAULT_EXPIRES_IN_MINUTES;

    const callerPlayerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': auth.sub },
    });

    const callerPlayerItem = callerPlayerResult.Items?.[0] as
      | PlayerRecord
      | undefined;
    if (!callerPlayerItem) {
      return badRequest('No player profile linked to your account');
    }

    const callerPlayerId = callerPlayerItem.playerId;

    const callerPresence = await dynamoDb.get({
      TableName: TableNames.PRESENCE,
      Key: { playerId: callerPlayerId },
    });

    const nowSeconds = Math.floor(Date.now() / 1000);
    const callerPresenceItem = callerPresence.Item as PresenceRow | undefined;
    if (
      !callerPresenceItem ||
      (typeof callerPresenceItem.ttl === 'number' &&
        callerPresenceItem.ttl <= nowSeconds)
    ) {
      return badRequest('You must appear online before joining the queue.');
    }

    const preferences: QueuePreferences = {};
    if (matchFormat !== undefined) preferences.matchFormat = matchFormat;
    if (stipulationId !== undefined) preferences.stipulationId = stipulationId;

    const queueRow: QueueRow = {
      playerId: callerPlayerId,
      joinedAt: new Date().toISOString(),
      ttl: nowSeconds + expiresInMinutes * 60,
      ...(Object.keys(preferences).length > 0 ? { preferences } : {}),
    };

    await dynamoDb.put({
      TableName: TableNames.MATCHMAKING_QUEUE,
      Item: queueRow,
    });

    return success({ status: 'queued' });
  } catch (err) {
    console.error('Error joining matchmaking queue:', err);
    return serverError('Failed to join matchmaking queue');
  }
};
