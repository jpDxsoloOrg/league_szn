import { describe, it, expect } from 'vitest';
import { getDaysRemaining, getDisplayStatus, isChallengedSide, isChallengerSide } from '../challengeUtils';
import type { ChallengeWithPlayers } from '../../../types/challenge';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-06-10T12:00:00.000Z');

function dates(createdDaysAgo: number, expiresInDays: number) {
  return {
    createdAt: new Date(NOW - createdDaysAgo * DAY).toISOString(),
    expiresAt: new Date(NOW + expiresInDays * DAY).toISOString(),
  };
}

describe('challengeUtils', () => {
  describe('getDisplayStatus', () => {
    it('keeps a pending challenge inside its deadline', () => {
      expect(getDisplayStatus({ status: 'pending', ...dates(1, 3) }, NOW)).toBe('pending');
    });

    it('shows a pending challenge past expiresAt as expired', () => {
      expect(getDisplayStatus({ status: 'pending', ...dates(1, -0.1) }, NOW)).toBe('expired');
    });

    it('applies the four-day limit to rows with a longer expiresAt', () => {
      expect(getDisplayStatus({ status: 'pending', ...dates(5, 2) }, NOW)).toBe('expired');
    });

    it('leaves settled statuses alone', () => {
      expect(getDisplayStatus({ status: 'accepted', ...dates(9, -5) }, NOW)).toBe('accepted');
      expect(getDisplayStatus({ status: 'declined', ...dates(9, -5) }, NOW)).toBe('declined');
    });
  });

  describe('getDaysRemaining', () => {
    it('rounds up and stops at zero', () => {
      expect(getDaysRemaining(dates(1, 2.5), NOW)).toBe(3);
      expect(getDaysRemaining(dates(1, -1), NOW)).toBe(0);
    });
  });

  describe('sides', () => {
    const member = (playerId: string) => ({ playerId, playerName: playerId, wrestlerName: playerId });
    const challenge = {
      challengerId: 'a',
      challengedId: 'b',
      challengeMode: 'tag_team',
      challengerTagTeam: { tagTeamId: 't1', tagTeamName: 'One', player1: member('a'), player2: member('a2') },
      challengedTagTeam: { tagTeamId: 't2', tagTeamName: 'Two', player1: member('b'), player2: member('b2') },
    } as ChallengeWithPlayers;

    it('counts both tag partners on their side', () => {
      expect(isChallengerSide(challenge, 'a2')).toBe(true);
      expect(isChallengedSide(challenge, 'b2')).toBe(true);
      expect(isChallengerSide(challenge, 'b2')).toBe(false);
    });

    it('is false without a player', () => {
      expect(isChallengerSide(challenge, null)).toBe(false);
      expect(isChallengedSide(challenge, null)).toBe(false);
    });
  });
});
