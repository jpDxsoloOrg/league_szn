import { APIGatewayProxyHandler } from 'aws-lambda';
import { getAuthContext } from '../../lib/auth';
import { isOfferExpired } from '../../lib/policies/contracts';
import { getRepositories, type Contract } from '../../lib/repositories';
import { notFound, serverError, success } from '../../lib/response';

export interface MyContractsResponse {
  playerId: string;
  /** Cached ledger balance; missing on the player row means 0. */
  balance: number;
  activeContract: Contract | null;
  /** Offers still open, soonest to expire first. */
  offers: Contract[];
  /** Everything else, newest first. */
  pastContracts: Contract[];
}

/**
 * GET /players/me/contracts (the signed-in player): their contract, open
 * offers and history, with the money. An offer past its expiry that the
 * hourly sweep hasn't reached yet is listed as expired.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { sub } = getAuthContext(event);
    const { roster: { players }, contracts } = getRepositories();
    const player = sub ? await players.findByUserId(sub) : null;
    if (!player) return notFound('No player profile found for this user');

    const now = new Date();
    const all = await contracts.listByPlayer(player.playerId);
    const shown = all.map((contract): Contract => (isOfferExpired(contract, now)
      ? { ...contract, status: 'expired', endReason: 'offerExpired' }
      : contract));

    const response: MyContractsResponse = {
      playerId: player.playerId,
      balance: player.balance ?? 0,
      activeContract: shown.find((contract) => contract.status === 'active') ?? null,
      offers: shown
        .filter((contract) => contract.status === 'offered')
        .sort((a, b) => a.offerExpiresAt.localeCompare(b.offerExpiresAt)),
      pastContracts: shown.filter((contract) => contract.status !== 'active' && contract.status !== 'offered'),
    };
    return success(response);
  } catch (err) {
    console.error('Error fetching own contracts:', err);
    return serverError('Failed to fetch contracts');
  }
};
