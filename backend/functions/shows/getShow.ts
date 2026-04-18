import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const showId = event.pathParameters?.showId;
    if (!showId) {
      return badRequest('Show ID is required');
    }

    const { shows } = getRepositories();
    const show = await shows.findById(showId);
    if (!show) {
      return notFound('Show not found');
    }

    return success(show);
  } catch (err) {
    console.error('Error fetching show:', err);
    return serverError('Failed to fetch show');
  }
};
