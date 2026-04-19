import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
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

    const { user: { fantasy } } = getRepositories();

    const existing = await fantasy.findCost(playerId);
    if (!existing) {
      return notFound('Wrestler cost not found. Run initialization first.');
    }

    const today = new Date().toISOString().split('T')[0];
    const costHistory = [...existing.costHistory];
    costHistory.push({
      date: today,
      cost: body.currentCost,
      reason: body.reason || 'Manual override',
    });
    while (costHistory.length > 20) costHistory.shift();

    const updated = await fantasy.upsertCost({
      ...existing,
      currentCost: body.currentCost,
      costHistory,
      updatedAt: new Date().toISOString(),
    });

    return success(updated);
  } catch (err) {
    console.error('Error updating wrestler cost:', err);
    return serverError('Failed to update wrestler cost');
  }
};
