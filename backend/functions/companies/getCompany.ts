import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const companyId = event.pathParameters?.companyId;
    if (!companyId) {
      return badRequest('Company ID is required');
    }

    const { leagueOps: { companies } } = getRepositories();
    const company = await companies.findById(companyId);
    if (!company) {
      return notFound('Company not found');
    }

    return success(company);
  } catch (err) {
    console.error('Error fetching company:', err);
    return serverError('Failed to fetch company');
  }
};
