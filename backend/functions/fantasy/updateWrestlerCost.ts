import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const denied = requireRole(event, 'Admin');
    if (denied) return denied;

    const playerId = event.pathParameters?.playerId;
    if (!playerId) {
      return badRequest('Player ID is required');
    }

    if (!event.body) {
      return badRequest('Request body is required');
    }

    const body = JSON.parse(event.body);
    if (typeof body.currentCost !== 'number' || body.currentCost <= 0) {
      return badRequest('currentCost must be a positive number');
    }

    const existing = await dynamoDb.get({
      TableName: TableNames.WRESTLER_COSTS,
      Key: { playerId },
    });

    if (!existing.Item) {
      return notFound('Wrestler cost not found. Run initialization first.');
    }

    const today = new Date().toISOString().split('T')[0];
    const costHistory = [...((existing.Item.costHistory as any[]) || [])];
    costHistory.push({
      date: today,
      cost: body.currentCost,
      reason: body.reason || 'Manual override',
    });
    while (costHistory.length > 20) costHistory.shift();

    const updatedItem = {
      ...existing.Item,
      currentCost: body.currentCost,
      costHistory,
      updatedAt: new Date().toISOString(),
    };

    await dynamoDb.put({
      TableName: TableNames.WRESTLER_COSTS,
      Item: updatedItem,
    });

    return success(updatedItem);
  } catch (err) {
    console.error('Error updating wrestler cost:', err);
    return serverError('Failed to update wrestler cost');
  }
};
