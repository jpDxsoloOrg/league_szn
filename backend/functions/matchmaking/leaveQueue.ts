import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { badRequest, forbidden, serverError, noContent } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can leave the matchmaking queue');
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

    // Idempotent delete — does not error if the row does not exist
    await dynamoDb.delete({
      TableName: TableNames.MATCHMAKING_QUEUE,
      Key: { playerId },
    });

    return noContent();
  } catch (err) {
    console.error('Error leaving matchmaking queue:', err);
    return serverError('Failed to leave matchmaking queue');
  }
};
