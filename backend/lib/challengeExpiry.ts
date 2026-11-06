import type { Challenge } from './repositories/types';

/** How long a challenge or counter-challenge stays open for a response. */
export const CHALLENGE_EXPIRY_DAYS = 4;

const CHALLENGE_EXPIRY_MS = CHALLENGE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

/** The `expiresAt` value for a challenge issued at `from`. */
export function challengeExpiresAt(from: Date = new Date()): string {
  return new Date(from.getTime() + CHALLENGE_EXPIRY_MS).toISOString();
}

/**
 * True when a pending challenge is past its deadline: the earlier of its
 * stored `expiresAt` and `createdAt` + CHALLENGE_EXPIRY_DAYS. Taking the
 * earlier of the two applies the current limit to rows that were written with
 * a longer `expiresAt`.
 */
export function isChallengeExpired(
  challenge: Pick<Challenge, 'createdAt' | 'expiresAt'>,
  now: number = Date.now(),
): boolean {
  const deadlines = [
    Date.parse(challenge.expiresAt),
    Date.parse(challenge.createdAt) + CHALLENGE_EXPIRY_MS,
  ].filter((deadline) => Number.isFinite(deadline));
  return deadlines.length > 0 && now >= Math.min(...deadlines);
}

/**
 * True when a challenge lapsed without an answer: the sweep has marked it
 * expired, or it is pending past its deadline and the hourly sweep has not
 * reached it yet.
 */
export function isChallengeLapsed(
  challenge: Pick<Challenge, 'status' | 'createdAt' | 'expiresAt'>,
  now: number = Date.now(),
): boolean {
  return challenge.status === 'expired'
    || (challenge.status === 'pending' && isChallengeExpired(challenge, now));
}
