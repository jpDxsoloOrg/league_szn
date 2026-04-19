import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { noContent, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const challengeId = event.pathParameters?.challengeId;
    if (!challengeId) {
      return badRequest('challengeId is required');
    }

    const { user: { challenges } } = getRepositories();

    const challenge = await challenges.findById(challengeId);
    if (!challenge) {
      return notFound('Challenge not found');
    }

    await challenges.delete(challengeId);

    return noContent();
  } catch (err) {
    console.error('Error deleting challenge:', err);
    return serverError('Failed to delete challenge');
  }
};
