import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { getOrNotFound } from '../../lib/dynamodbUtils';
import { success, badRequest, serverError } from '../../lib/response';
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

    const existing = await getOrNotFound(
      TableNames.WRESTLER_COSTS,
      { playerId },
      'Wrestler cost not found. Run initialization first.'
    );
    if ('notFoundResponse' in existing) {
      return existing.notFoundResponse;
    }

    const today = new Date().toISOString().split('T')[0];
    const currentItem = existing.item;
    const costHistory = [...((currentItem.costHistory as Array<Record<string, unknown>>) || [])];
    costHistory.push({
      date: today,
      cost: body.currentCost,
      reason: body.reason || 'Manual override',
    });
    while (costHistory.length > 20) costHistory.shift();

    const updatedItem = {
      ...currentItem,
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
