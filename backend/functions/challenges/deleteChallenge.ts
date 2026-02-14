import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
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

    const result = await dynamoDb.get({
      TableName: TableNames.CHALLENGES,
      Key: { challengeId },
    });
    if (!result.Item) {
      return notFound('Challenge not found');
    }

    await dynamoDb.delete({
      TableName: TableNames.CHALLENGES,
      Key: { challengeId },
    });

    return noContent();
  } catch (err) {
    console.error('Error deleting challenge:', err);
    return serverError('Failed to delete challenge');
  }
};
