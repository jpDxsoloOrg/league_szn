import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const locationId = event.pathParameters?.locationId;
    if (!locationId) {
      return badRequest('Location ID is required');
    }

    const { leagueOps: { locations } } = getRepositories();
    const location = await locations.findById(locationId);
    if (!location) {
      return notFound('Location not found');
    }

    return success(location);
  } catch (err) {
    console.error('Error fetching location:', err);
    return serverError('Failed to fetch location');
  }
};
