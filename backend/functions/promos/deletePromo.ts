import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { noContent, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const promoId = event.pathParameters?.promoId;
    if (!promoId) {
      return badRequest('promoId is required');
    }

    const result = await dynamoDb.get({
      TableName: TableNames.PROMOS,
      Key: { promoId },
    });
    if (!result.Item) {
      return notFound('Promo not found');
    }

    await dynamoDb.delete({
      TableName: TableNames.PROMOS,
      Key: { promoId },
    });

    return noContent();
  } catch (err) {
    console.error('Error deleting promo:', err);
    return serverError('Failed to delete promo');
  }
};
