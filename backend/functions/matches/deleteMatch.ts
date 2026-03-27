import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Moderator');
  if (denied) return denied;

  try {
    const matchId = event.pathParameters?.matchId;
    if (!matchId) {
      return badRequest('matchId is required');
    }

    // Query the match (matchId is PK, need to find the sort key 'date')
    const matchResult = await dynamoDb.query({
      TableName: TableNames.MATCHES,
      KeyConditionExpression: 'matchId = :matchId',
      ExpressionAttributeValues: { ':matchId': matchId },
      Limit: 1,
    });

    const match = matchResult.Items?.[0];
    if (!match) {
      return notFound('Match not found');
    }

    // Delete the match
    await dynamoDb.delete({
      TableName: TableNames.MATCHES,
      Key: { matchId, date: match.date as string },
    });

    // If match was linked to an event, remove it from the event's matchCards
    const eventId = match.eventId as string | undefined;
    if (eventId) {
      try {
        const eventResult = await dynamoDb.get({
          TableName: TableNames.EVENTS,
          Key: { eventId },
        });

        if (eventResult.Item) {
          const matchCards = (eventResult.Item.matchCards as Record<string, unknown>[] | undefined) || [];
          const updatedCards = matchCards.filter(
            (card) => (card as Record<string, unknown>).matchId !== matchId
          );

          await dynamoDb.update({
            TableName: TableNames.EVENTS,
            Key: { eventId },
            UpdateExpression: 'SET matchCards = :cards, updatedAt = :now',
            ExpressionAttributeValues: {
              ':cards': updatedCards,
              ':now': new Date().toISOString(),
            },
          });
        }
      } catch (err) {
        console.warn('Failed to remove match from event:', err);
      }
    }

    return success({ message: 'Match deleted', matchId });
  } catch (err) {
    console.error('Error deleting match:', err);
    return serverError('Failed to delete match');
  }
};
