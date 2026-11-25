import { APIGatewayProxyHandler } from 'aws-lambda';
import { isPlayerVisible } from '../../lib/needsWrestler';
import { getVerifiedCaller } from '../../lib/optionalCaller';
import { isFreeAgent } from '../../lib/policies/contracts';
import { toPublicPlayer } from '../../lib/publicPlayer';
import { getRepositories } from '../../lib/repositories';
import { serverError, success } from '../../lib/response';

/**
 * GET /free-agents (public): visible players with no active contract, in the
 * same public shape as GET /players (no balance unless staff or self).
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const players = await getRepositories().roster.players.list();
    const caller = await getVerifiedCaller(event);
    const freeAgents = players
      .filter((player) => isPlayerVisible(player) && isFreeAgent(player))
      .sort((a, b) => (a.currentWrestler ?? a.name).localeCompare(b.currentWrestler ?? b.name));
    return success(freeAgents.map((player) => toPublicPlayer(player, caller)));
  } catch (err) {
    console.error('Error fetching free agents:', err);
    return serverError('Failed to fetch free agents');
  }
};
