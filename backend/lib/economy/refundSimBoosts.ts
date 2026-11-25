/**
 * Refunds sim interference on a match that will never be simulated (ECO-08):
 * a result recorded by hand, or a scheduled match that is deleted.
 *
 * Each boost gets one `refund` entry for exactly what its purchase entry took,
 * keyed `${purchaseKey}#refund`, so running this twice never pays twice.
 * Each refund is its own unit of work: the caller's own transaction may write
 * the same player rows (one DynamoDB operation per item per transaction).
 */
import { getRepositories } from '../repositories';
import { ConcurrencyError, NotFoundError } from '../repositories/errors';
import { DuplicatePostingError } from '../repositories/ledger';
import type { Match } from '../repositories/types';
import { simBoostRefundKey } from './effects';

export type SimBoostRefundReason = 'manualResult' | 'matchDeleted';

const REFUND_NOTES: Record<SimBoostRefundReason, string> = {
  manualResult: 'Sim interference refunded: the match result was recorded by hand',
  matchDeleted: 'Sim interference refunded: the match was deleted',
};

/** A concurrent posting for the same player fails the refund; it is safe to retry. */
const MAX_ATTEMPTS = 3;

/** Returns how many refunds were posted by this call. */
export async function refundSimBoosts(
  match: Pick<Match, 'matchId' | 'simBoosts'>,
  reason: SimBoostRefundReason,
): Promise<number> {
  const boosts = match.simBoosts ?? [];
  if (boosts.length === 0) return 0;

  const { ledger, runInTransaction } = getRepositories();
  let posted = 0;
  for (const boost of boosts) {
    const purchase = await ledger.getByIdempotencyKey(boost.purchaseKey);
    if (!purchase || purchase.amount >= 0) {
      console.warn(`No purchase entry for sim boost ${boost.purchaseKey}; nothing to refund`);
      continue;
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await runInTransaction(async (tx) => {
          tx.postLedgerEntry({
            playerId: boost.playerId,
            kind: 'refund',
            amount: -purchase.amount,
            idempotencyKey: simBoostRefundKey(boost.purchaseKey),
            ref: { type: 'match', id: match.matchId },
            note: REFUND_NOTES[reason],
          });
        });
        posted++;
        break;
      } catch (err) {
        // Already refunded, or the player is gone: nothing left to do.
        if (err instanceof DuplicatePostingError || err instanceof NotFoundError) break;
        if (err instanceof ConcurrencyError && attempt < MAX_ATTEMPTS) continue;
        throw err;
      }
    }
  }
  return posted;
}
