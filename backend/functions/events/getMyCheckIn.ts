import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, forbidden, notFound, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can view their event check-in');
    }

    const eventId = event.pathParameters?.eventId;
    if (!eventId) {
      return badRequest('eventId is required');
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

    const checkInResult = await dynamoDb.get({
      TableName: TableNames.EVENT_CHECK_INS,
      Key: { eventId, playerId },
    });

    if (!checkInResult.Item) {
      return notFound('No check-in found for this event');
    }

    return success(checkInResult.Item);
  } catch (err) {
    console.error('Error fetching event check-in:', err);
    return serverError('Failed to fetch event check-in');
  }
};
