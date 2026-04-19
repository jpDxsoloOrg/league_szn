import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { noContent, badRequest, notFound, serverError, conflict } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const eventId = event.pathParameters?.eventId;

    if (!eventId) {
      return badRequest('Event ID is required');
    }

    const { leagueOps: { events }, competition: { matches } } = getRepositories();

    const eventItem = await events.findById(eventId);
    if (!eventItem) {
      return notFound('Event not found');
    }

    // Check if event has completed matches
    if (Array.isArray(eventItem.matchCards) && eventItem.matchCards.length > 0) {
      const matchIds = eventItem.matchCards
        .map((card) => card.matchId)
        .filter((matchId): matchId is string => typeof matchId === 'string' && matchId.length > 0);

      if (matchIds.length > 0) {
        const matchChecks = await Promise.all(
          matchIds.map(async (matchId: string) => {
            return matches.findById(matchId);
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
    await events.delete(eventId);

    return noContent();
  } catch (err) {
    console.error('Error deleting event:', err);
    return serverError('Failed to delete event');
  }
};
