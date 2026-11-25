import { isOfferExpired } from '../../lib/policies/contracts';
import { getRepositories } from '../../lib/repositories';
import { createNotification } from '../../lib/notifications';
import { contractLabel, expireOffer, notifyPlayer, playerLabel } from './contractShared';

export interface ExpireOffersResult {
  open: number;
  expired: number;
  skipped: number;
  failed: number;
}

/**
 * Scheduled sweep (hourly, ECO-04): moves offers past `offerExpiresAt` to
 * `expired` and tells the player and the GM who made the offer. The write is
 * guarded on the offer still being open, so one accepted or withdrawn between
 * the list and the write is left alone and counted as skipped. Accept and
 * decline also check expiry themselves, so the sweep's lag never lets a late
 * answer through.
 */
export const handler = async (): Promise<ExpireOffersResult> => {
  const { contracts, roster: { players } } = getRepositories();
  const open = await contracts.list({ status: 'offered' });
  const now = new Date();
  const overdue = open.filter((contract) => isOfferExpired(contract, now));

  const result: ExpireOffersResult = { open: open.length, expired: 0, skipped: 0, failed: 0 };

  for (const contract of overdue) {
    try {
      if (!(await expireOffer(contract, now))) {
        result.skipped++;
        continue;
      }
      result.expired++;
      const player = await players.findById(contract.playerId);
      const label = contractLabel(contract);
      if (player) {
        await notifyPlayer(player, contract, 'contract_offer_expired', `Your ${label} offer has expired.`);
      }
      if (contract.offeredBy) {
        const name = player ? playerLabel(player) : 'a player';
        await createNotification({
          userId: contract.offeredBy,
          type: 'contract_offer_expired',
          message: `Your ${label} offer to ${name} expired without an answer.`,
          sourceId: contract.contractId,
          sourceType: 'contract',
        });
      }
    } catch (err) {
      result.failed++;
      console.error(`Failed to expire contract offer ${contract.contractId}:`, err);
    }
  }

  console.log('Contract offer expiry sweep complete:', JSON.stringify(result));
  return result;
};
