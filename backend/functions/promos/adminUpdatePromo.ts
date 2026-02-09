import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const promoId = event.pathParameters?.promoId;
    if (!promoId) {
      return badRequest('promoId is required');
    }

    const body = JSON.parse(event.body || '{}');
    const { isPinned, isHidden } = body;

    const result = await dynamoDb.get({
      TableName: TableNames.PROMOS,
      Key: { promoId },
    });
    if (!result.Item) {
      return notFound('Promo not found');
    }

    const now = new Date().toISOString();
    const updates: string[] = ['updatedAt = :now'];
    const values: Record<string, unknown> = { ':now': now };

    if (typeof isPinned === 'boolean') {
      updates.push('isPinned = :pinned');
      values[':pinned'] = isPinned;
    }
    if (typeof isHidden === 'boolean') {
      updates.push('isHidden = :hidden');
      values[':hidden'] = isHidden;
    }

    await dynamoDb.update({
      TableName: TableNames.PROMOS,
      Key: { promoId },
      UpdateExpression: `SET ${updates.join(', ')}`,
      ExpressionAttributeValues: values,
    });

    return success({ ...result.Item, ...body, updatedAt: now });
  } catch (err) {
    console.error('Error updating promo:', err);
    return serverError('Failed to update promo');
  }
};
