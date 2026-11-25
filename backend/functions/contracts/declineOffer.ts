import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories, ConcurrencyError } from '../../lib/repositories';
import { conflict, serverError, success } from '../../lib/response';
import { contractLabel, loadOwnOpenOffer, notifyStaff, playerLabel } from './contractShared';

/** POST /contracts/{contractId}/decline (the player the offer was made to). */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const lookup = await loadOwnOpenOffer(event);
    if (!lookup.ok) return lookup.response;
    const { contract, player } = lookup;

    let declined;
    try {
      declined = await getRepositories().contracts.update(contract.contractId, {
        status: 'declined',
        endedAt: new Date().toISOString(),
        endReason: 'offerDeclined',
      }, 'offered');
    } catch (err) {
      if (err instanceof ConcurrencyError) return conflict('This offer is no longer open');
      throw err;
    }

    await notifyStaff(
      contract,
      'contract_offer_declined',
      `${playerLabel(player)} declined a ${contractLabel(contract)} offer.`,
    );

    return success(declined);
  } catch (err) {
    console.error('Error declining contract offer:', err);
    return serverError('Failed to decline the offer');
  }
};
