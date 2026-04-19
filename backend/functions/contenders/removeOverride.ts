import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { invokeAsync } from '../../lib/asyncLambda';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const championshipId = event.pathParameters?.championshipId;
    const playerId = event.pathParameters?.playerId;

    if (!championshipId || !playerId) {
      return badRequest('championshipId and playerId are required');
    }

    const { contenders } = getRepositories();

    // Get the existing override
    const existing = await contenders.findOverride(championshipId, playerId);

    if (!existing || !existing.active) {
      return notFound('No active override found for this player and championship');
    }

    // Deactivate the override
    await contenders.deactivateOverride(championshipId, playerId, 'removed by admin');

    // Trigger ranking recalculation for this championship
    try {
      await invokeAsync('contenders', { source: 'recordResult', championshipId });
    } catch (err) {
      console.warn('Failed to invoke calculateRankings async:', err);
    }

    return success({ message: 'Override removed successfully', championshipId, playerId });
  } catch (err) {
    console.error('Error removing contender override:', err);
    return serverError('Failed to remove contender override');
  }
};
