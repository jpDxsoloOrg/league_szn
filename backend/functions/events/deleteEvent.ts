import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { noContent, badRequest, notFound, serverError, conflict } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const eventId = event.pathParameters?.eventId;

    if (!eventId) {
      return badRequest('Event ID is required');
    }

    // Check if event exists
    const existingEvent = await dynamoDb.get({
      TableName: TableNames.EVENTS,
      Key: { eventId },
    });

    if (!existingEvent.Item) {
      return notFound('Event not found');
    }

    const eventItem = existingEvent.Item as Record<string, any>;

    // Check if event has completed matches
    if (eventItem.matchCards && eventItem.matchCards.length > 0) {
      const matchIds = eventItem.matchCards
        .filter((card: Record<string, any>) => card.matchId)
        .map((card: Record<string, any>) => card.matchId);

      if (matchIds.length > 0) {
        const matchChecks = await Promise.all(
          matchIds.map(async (matchId: string) => {
            // Matches table uses a composite PK (matchId + date), so query by hash key.
            const matchResult = await dynamoDb.query({
              TableName: TableNames.MATCHES,
              KeyConditionExpression: 'matchId = :matchId',
              ExpressionAttributeValues: { ':matchId': matchId },
              Limit: 1,
            });
            return matchResult.Items?.[0] as Record<string, any> | undefined;
          })
        );

        const completedMatches = matchChecks.filter(
          (match) => match && match.status === 'completed'
        );

        if (completedMatches.length > 0) {
          return conflict(
            `Cannot delete event. It has ${completedMatches.length} completed match(es). Remove or reset the completed matches first.`
          );
        }
      }
    }

    // Delete the event
    await dynamoDb.delete({
      TableName: TableNames.EVENTS,
      Key: { eventId },
    });

    return noContent();
  } catch (err) {
    console.error('Error deleting event:', err);
    return serverError('Failed to delete event');
  }
};
