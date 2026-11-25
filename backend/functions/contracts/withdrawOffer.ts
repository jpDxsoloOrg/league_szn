import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories, ConcurrencyError } from '../../lib/repositories';
import { conflict, notFound, serverError, success } from '../../lib/response';

/** POST /contracts/{contractId}/withdraw (Moderator/Admin): take back an open offer. */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const contractId = event.pathParameters?.contractId;
    if (!contractId) return notFound('Contract not found');

    const { contracts } = getRepositories();
    const contract = await contracts.findById(contractId);
    if (!contract) return notFound('Contract not found');
    if (contract.status !== 'offered') {
      return conflict(`Only an open offer can be withdrawn; this one is ${contract.status}`);
    }

    try {
      const withdrawn = await contracts.update(contractId, {
        status: 'withdrawn',
        endedAt: new Date().toISOString(),
        endReason: 'offerWithdrawn',
      }, 'offered');
      return success(withdrawn);
    } catch (err) {
      if (err instanceof ConcurrencyError) return conflict('This offer is no longer open');
      throw err;
    }
  } catch (err) {
    console.error('Error withdrawing contract offer:', err);
    return serverError('Failed to withdraw the offer');
  }
};
