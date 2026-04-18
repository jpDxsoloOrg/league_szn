import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const { tournaments } = getRepositories();
    const items = await tournaments.list();

    // Sort by creation date descending (most recent first)
    const sorted = items.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return success(sorted);
  } catch (err) {
    console.error('Error fetching tournaments:', err);
    return serverError('Failed to fetch tournaments');
  }
};
