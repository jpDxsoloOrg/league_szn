import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { getOrNotFound } from '../../lib/dynamodbUtils';
import { noContent, badRequest, serverError, conflict } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const eventId = event.pathParameters?.eventId;

    if (!eventId) {
      return badRequest('Event ID is required');
    }

    const existingEvent = await getOrNotFound(TableNames.EVENTS, { eventId }, 'Event not found');
    if ('notFoundResponse' in existingEvent) {
      return existingEvent.notFoundResponse;
    }

    const eventItem = existingEvent.item as Record<string, unknown>;

    // Check if event has completed matches
    if (Array.isArray(eventItem.matchCards) && eventItem.matchCards.length > 0) {
      const matchIds = eventItem.matchCards
        .filter((card): card is Record<string, unknown> => !!card && typeof card === 'object')
        .map((card) => card.matchId)
        .filter((matchId): matchId is string => typeof matchId === 'string' && matchId.length > 0);

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
            return matchResult.Items?.[0] as Record<string, unknown> | undefined;
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
