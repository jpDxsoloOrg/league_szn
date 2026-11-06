import type { Challenge, Promo } from './repositories/types';

/** The editor creates a call-out's challenge right after the promo. */
const CALL_OUT_CHALLENGE_WINDOW_MS = 5 * 60 * 1000;

interface ChallengeReader {
  findById(challengeId: string): Promise<Challenge | null>;
  listByChallenger(playerId: string): Promise<Challenge[]>;
}

/**
 * The challenge a promo produced. Older call-outs hold no link, so they match
 * on the same players and title, issued just after the promo. That window is
 * tight on purpose: a wrong match would close or block an unrelated challenge.
 */
export async function findPromoChallenge(promo: Promo, challenges: ChallengeReader): Promise<Challenge | null> {
  if (promo.challengeId) return challenges.findById(promo.challengeId);
  if (promo.promoType !== 'call-out' || !promo.targetPlayerId) return null;

  const promoTime = Date.parse(promo.createdAt);
  const sinceThePromo = (challenge: Challenge) => Date.parse(challenge.createdAt) - promoTime;
  const candidates = (await challenges.listByChallenger(promo.playerId))
    .filter((challenge) => (
      challenge.challengedId === promo.targetPlayerId
      && challenge.championshipId === promo.championshipId
      && (!challenge.promoId || challenge.promoId === promo.promoId)
      && sinceThePromo(challenge) >= 0
      && sinceThePromo(challenge) <= CALL_OUT_CHALLENGE_WINDOW_MS
    ))
    .sort((first, second) => sinceThePromo(first) - sinceThePromo(second));
  return candidates[0] ?? null;
}

/** The challenge whose terms stand: the end of any chain of counters. */
export async function followCounters(challenge: Challenge, challenges: ChallengeReader): Promise<Challenge> {
  const visited = new Set([challenge.challengeId]);
  let current = challenge;
  while (current.status === 'countered' && current.counteredChallengeId && !visited.has(current.counteredChallengeId)) {
    const counter = await challenges.findById(current.counteredChallengeId);
    if (!counter) break;
    visited.add(counter.challengeId);
    current = counter;
  }
  return current;
}
