import { APIGatewayProxyHandler } from 'aws-lambda';
import { isPlayerVisible } from '../../lib/needsWrestler';
import { canViewHiddenPlayer } from '../../lib/optionalCaller';
import { isFreeAgent } from '../../lib/policies/contracts';
import { getRepositories } from '../../lib/repositories';
import { notFound, serverError, success } from '../../lib/response';
import { toPublicContract, type PublicContract } from './contractShared';

export interface PlayerContractResponse {
  playerId: string;
  freeAgent: boolean;
  /** The active contract's type, status and end condition. Never any money. */
  contract: PublicContract | null;
}

/** GET /players/{playerId}/contract (public): the player's contract badge. */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return notFound('Player not found');

    const { roster: { players }, contracts } = getRepositories();
    const player = await players.findById(playerId);
    if (!player) return notFound('Player not found');
    if (!isPlayerVisible(player) && !(await canViewHiddenPlayer(event, player))) {
      return notFound('Player not found');
    }

    const active = player.activeContractId ? await contracts.findById(player.activeContractId) : null;
    const response: PlayerContractResponse = {
      playerId,
      freeAgent: isFreeAgent(player),
      contract: active?.status === 'active' ? toPublicContract(active) : null,
    };
    return success(response);
  } catch (err) {
    console.error('Error fetching player contract:', err);
    return serverError('Failed to fetch the contract');
  }
};
