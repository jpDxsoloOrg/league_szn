import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories, NotFoundError } from '../../lib/repositories';
import type { ShowPatch } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

// updateHandlerFactory has no validation hook for the company check below, so
// the patch is built here. Only these fields ever reach the repository.
const PATCH_FIELDS: ReadonlyArray<keyof ShowPatch> = [
  'name',
  'companyId',
  'description',
  'schedule',
  'dayOfWeek',
  'ppvDate',
  'imageUrl',
];

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const showId = event.pathParameters?.showId;
    if (!showId) {
      return badRequest('Show ID is required');
    }

    const { data: body, error: parseError } = parseBody<ShowPatch>(event);
    if (parseError) return parseError;

    const patch: ShowPatch = {};
    for (const field of PATCH_FIELDS) {
      if (body[field] !== undefined) patch[field] = body[field];
    }

    const { leagueOps: { shows, companies } } = getRepositories();
    const existing = await shows.findById(showId);
    if (!existing) {
      return notFound('Show not found');
    }

    // If companyId is being changed, validate the new company exists
    if (patch.companyId !== undefined) {
      const company = await companies.findById(patch.companyId);
      if (!company) {
        return notFound(`Company ${patch.companyId} not found`);
      }
    }

    if (Object.keys(patch).length === 0) {
      return badRequest('No valid fields to update');
    }

    const updated = await shows.update(showId, patch);
    return success(updated);
  } catch (err) {
    if (err instanceof NotFoundError) return notFound('Show not found');
    console.error('Error updating show:', err);
    return serverError('Failed to update show');
  }
};
