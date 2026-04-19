import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories, NotFoundError } from '../../lib/repositories';
import { success, badRequest, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

interface UpdateCompanyBody {
  name?: string;
  abbreviation?: string;
  imageUrl?: string;
  description?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const companyId = event.pathParameters?.companyId;
    if (!companyId) {
      return badRequest('Company ID is required');
    }

    const { data: body, error: parseError } = parseBody<UpdateCompanyBody>(event);
    if (parseError) return parseError;

    const { leagueOps: { companies } } = getRepositories();
    const existing = await companies.findById(companyId);
    if (!existing) {
      return badRequest('Company not found');
    }

    const hasChanges = Object.values(body).some((v) => v !== undefined);
    if (!hasChanges) {
      return badRequest('No valid fields to update');
    }

    const updated = await companies.update(companyId, body);
    return success(updated);
  } catch (err) {
    if (err instanceof NotFoundError) return badRequest('Company not found');
    console.error('Error updating company:', err);
    return serverError('Failed to update company');
  }
};
