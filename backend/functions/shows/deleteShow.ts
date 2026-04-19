import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { noContent, badRequest, serverError, conflict } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const showId = event.pathParameters?.showId;
    if (!showId) {
      return badRequest('Show ID is required');
    }

    const { leagueOps: { shows, events } } = getRepositories();
    const show = await shows.findById(showId);
    if (!show) {
      return badRequest('Show not found');
    }

    // Check if any events reference this show
    const allEvents = await events.list();
    const showEvents = allEvents.filter((e) => e.showId === showId);

    if (showEvents.length > 0) {
      return conflict(
        `Cannot delete show. ${showEvents.length} event(s) are still referencing this show.`
      );
    }

    await shows.delete(showId);
    return noContent();
  } catch (err) {
    console.error('Error deleting show:', err);
    return serverError('Failed to delete show');
  }
};
