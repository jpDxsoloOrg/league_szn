import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories, ConcurrencyError } from '../../lib/repositories';
import { conflict, serverError, success } from '../../lib/response';
import { contractLabel, loadOwnOpenOffer, notifyStaff, playerLabel } from './contractShared';

export const ALREADY_UNDER_CONTRACT_MESSAGE = 'You already have an active contract';

/**
 * POST /contracts/{contractId}/accept (the player the offer was made to).
 *
 * One transaction: the contract becomes active, `player.activeContractId` is
 * set only if the player has none (`attribute_not_exists`), and every other
 * open offer to the player is withdrawn. Any of those guards failing rolls
 * the whole thing back and answers 409.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const lookup = await loadOwnOpenOffer(event);
    if (!lookup.ok) return lookup.response;
    const { contract, player } = lookup;

    if (player.activeContractId) return conflict(ALREADY_UNDER_CONTRACT_MESSAGE);

    const repos = getRepositories();
    if (contract.type === 'season') {
      const activeSeason = await repos.season.seasons.findActive();
      if (activeSeason?.seasonId !== contract.seasonId) {
        return conflict('The season this contract was for is no longer active');
      }
    }

    const otherOffers = (await repos.contracts.listByPlayer(player.playerId))
      .filter((other) => other.status === 'offered' && other.contractId !== contract.contractId);
    const now = new Date().toISOString();

    try {
      await repos.runInTransaction(async (tx) => {
        tx.updateContract(contract.contractId, { status: 'active', startedAt: now }, 'offered');
        tx.setPlayerActiveContract(player.playerId, contract.contractId);
        for (const other of otherOffers) {
          tx.updateContract(other.contractId, {
            status: 'withdrawn',
            endedAt: now,
            endReason: 'otherOfferAccepted',
          }, 'offered');
        }
      });
    } catch (err) {
      if (!(err instanceof ConcurrencyError)) throw err;
      const current = await repos.roster.players.findById(player.playerId);
      if (current?.activeContractId) return conflict(ALREADY_UNDER_CONTRACT_MESSAGE);
      return conflict('Your offers changed while saving. Reload and try again.');
    }

    await notifyStaff(
      contract,
      'contract_offer_accepted',
      `${playerLabel(player)} accepted a ${contractLabel(contract)} offer.`,
    );

    const accepted = await repos.contracts.findById(contract.contractId);
    return success({
      contract: accepted,
      withdrawnOfferIds: otherOffers.map((other) => other.contractId),
    });
  } catch (err) {
    console.error('Error accepting contract offer:', err);
    return serverError('Failed to accept the offer');
  }
};
