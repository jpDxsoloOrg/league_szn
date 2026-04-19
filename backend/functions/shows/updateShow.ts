import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories, NotFoundError } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

interface UpdateShowBody {
  name?: string;
  companyId?: string;
  description?: string;
  schedule?: string;
  dayOfWeek?: string;
  imageUrl?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const showId = event.pathParameters?.showId;
    if (!showId) {
      return badRequest('Show ID is required');
    }

    const { data: body, error: parseError } = parseBody<UpdateShowBody>(event);
    if (parseError) return parseError;

    const { shows, companies } = getRepositories();
    const existing = await shows.findById(showId);
    if (!existing) {
      return notFound('Show not found');
    }

    // If companyId is being changed, validate the new company exists
    if (body.companyId !== undefined) {
      const company = await companies.findById(body.companyId);
      if (!company) {
        return notFound(`Company ${body.companyId} not found`);
      }
    }

    const hasChanges = Object.values(body).some((v) => v !== undefined);
    if (!hasChanges) {
      return badRequest('No valid fields to update');
    }

    const updated = await shows.update(showId, body);
    return success(updated);
  } catch (err) {
    if (err instanceof NotFoundError) return notFound('Show not found');
    console.error('Error updating show:', err);
    return serverError('Failed to update show');
  }
};
