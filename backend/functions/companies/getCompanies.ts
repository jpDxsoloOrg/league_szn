import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const { companies } = getRepositories();
    const items = await companies.list();
    return success(items);
  } catch (err) {
    console.error('Error fetching companies:', err);
    return serverError('Failed to fetch companies');
  }
};
