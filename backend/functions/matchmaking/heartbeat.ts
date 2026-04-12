import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

const PRESENCE_TTL_SECONDS = 5 * 60;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can send presence heartbeats');
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

    const playerId = callerPlayer.playerId as string;
    const lastSeenAt = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + PRESENCE_TTL_SECONDS;

    await dynamoDb.put({
      TableName: TableNames.PRESENCE,
      Item: {
        playerId,
        lastSeenAt,
        ttl,
      },
    });

    return success({ playerId, lastSeenAt });
  } catch (err) {
    console.error('Error recording presence heartbeat:', err);
    return serverError('Failed to record presence heartbeat');
  }
};
