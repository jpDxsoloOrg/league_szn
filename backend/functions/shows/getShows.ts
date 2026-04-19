import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const companyId = event.queryStringParameters?.companyId;
    const { leagueOps: { shows } } = getRepositories();

    const items = companyId
      ? await shows.listByCompany(companyId)
      : await shows.list();

    return success(items);
  } catch (err) {
    console.error('Error fetching shows:', err);
    return serverError('Failed to fetch shows');
  }
};
