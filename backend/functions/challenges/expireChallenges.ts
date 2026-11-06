import { getRepositories } from '../../lib/repositories';
import { isChallengeExpired } from '../../lib/challengeExpiry';

export interface ExpireChallengesResult {
  pending: number;
  expired: number;
  skipped: number;
  failed: number;
}

/**
 * Scheduled sweep: moves pending challenges past their deadline to 'expired'.
 *
 * The write is conditional on the row still being pending, so a challenge
 * accepted between the list and the write keeps its accepted status and is
 * counted as skipped. One bad row is logged and doesn't stop the sweep;
 * anything it leaves behind is picked up on the next run.
 */
export const handler = async (): Promise<ExpireChallengesResult> => {
  const { user: { challenges } } = getRepositories();

  const pending = await challenges.listByStatus('pending');
  const now = Date.now();
  const overdue = pending.filter((challenge) => isChallengeExpired(challenge, now));

  const result: ExpireChallengesResult = {
    pending: pending.length,
    expired: 0,
    skipped: 0,
    failed: 0,
  };

  for (const { challengeId } of overdue) {
    try {
      if (await challenges.expireIfPending(challengeId)) {
        result.expired++;
      } else {
        result.skipped++;
      }
    } catch (err) {
      result.failed++;
      console.error(`Failed to expire challenge ${challengeId}:`, err);
    }
  }

  console.log('Challenge expiry sweep complete:', JSON.stringify(result));
  return result;
};
