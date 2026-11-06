import { describe, it, expect } from 'vitest';
import { findCallOutChallenge, findChallengeToBook, getChallengeTitleOptions, getDaysRemaining, getDisplayStatus, isChallengedSide, isChallengerSide } from '../challengeUtils';
import type { Championship } from '../../../types';
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

describe('call-out challenges', () => {
  const promo = {
    promoId: 'pr1', playerId: 'p1', targetPlayerId: 'p2', championshipId: 'c1',
    createdAt: '2026-06-10T12:00:00.000Z',
  };
  const challenge = (overrides: Partial<ChallengeWithPlayers>) => ({
    challengeId: 'ch1', challengerId: 'p1', challengedId: 'p2', championshipId: 'c1',
    status: 'accepted', createdAt: '2026-06-10T12:00:03.000Z', ...overrides,
  }) as ChallengeWithPlayers;

  it('findCallOutChallenge prefers the stored link over closeness in time', () => {
    const near = challenge({ challengeId: 'near' });
    const linked = challenge({ challengeId: 'linked', createdAt: '2026-06-12T12:00:00.000Z' });
    expect(findCallOutChallenge([near, linked], { ...promo, challengeId: 'linked' }, 'p2')).toBe(linked);
  });

  it('findChallengeToBook uses the stored link', () => {
    const linked = challenge({ challengeId: 'linked', createdAt: '2026-06-12T12:00:00.000Z' });
    expect(findChallengeToBook([challenge({}), linked], { ...promo, challengeId: 'linked' })).toBe(linked);
  });

  it('findChallengeToBook matches an older promo on players, title and time', () => {
    const issued = challenge({});
    expect(findChallengeToBook([
      challenge({ challengeId: 'other-title', championshipId: 'c2' }),
      challenge({ challengeId: 'days-later', createdAt: '2026-06-12T12:00:00.000Z' }),
      challenge({ challengeId: 'before', createdAt: '2026-06-10T11:59:00.000Z' }),
      challenge({ challengeId: 'other-promo', promoId: 'pr2' }),
      issued,
    ], promo)).toBe(issued);
  });

  it('findChallengeToBook finds nothing for a promo with no challenge near it', () => {
    expect(findChallengeToBook([challenge({ createdAt: '2026-06-12T12:00:00.000Z' })], promo)).toBeNull();
  });

  it('findChallengeToBook follows counters to the terms that stand', () => {
    const counter = challenge({ challengeId: 'ch2', matchType: 'Cage', createdAt: '2026-06-11T12:00:00.000Z' });
    const original = challenge({ status: 'countered', counteredChallengeId: 'ch2' });
    expect(findChallengeToBook([original, counter], promo)).toBe(counter);
  });
});

describe('getChallengeTitleOptions', () => {
  const title = (championshipId: string, overrides: Partial<Championship> = {}): Championship => ({
    championshipId, name: championshipId, type: 'singles', createdAt: '', isActive: true, ...overrides,
  });
  const singles = { challengeMode: 'singles' as const, matchType: 'Singles', sides: [[{ playerId: 'p1' }], [{ playerId: 'p2' }]] };
  const tag = {
    challengeMode: 'tag_team' as const,
    matchType: 'Tag Team',
    sides: [[{ playerId: 'a1' }, { playerId: 'a2' }], [{ playerId: 'b1' }, { playerId: 'b2' }]],
  };
  const ids = (titles: Championship[]) => titles.map((championship) => championship.championshipId);

  it('offers singles titles held by either side, and vacant ones', () => {
    const titles = [
      title('opponent', { currentChampion: 'p2' }),
      title('mine', { currentChampion: 'p1' }),
      title('vacant'),
      title('someone-else', { currentChampion: 'p9' }),
      title('tag-belts', { type: 'tag' }),
      title('retired', { isActive: false }),
    ];
    expect(ids(getChallengeTitleOptions(titles, singles))).toEqual(['opponent', 'mine', 'vacant']);
  });

  it('offers tag titles held by one team, whatever order the holders are in', () => {
    const titles = [
      title('theirs', { type: 'tag', currentChampion: ['b2', 'b1'] }),
      title('split', { type: 'tag', currentChampion: ['a1', 'b1'] }),
      title('world'),
    ];
    expect(ids(getChallengeTitleOptions(titles, tag))).toEqual(['theirs']);
  });

  it('offers nothing when the match type does not suit the challenge', () => {
    expect(getChallengeTitleOptions([title('world')], { ...singles, matchType: 'Tag Team' })).toEqual([]);
    expect(getChallengeTitleOptions([title('belts', { type: 'tag' })], { ...tag, matchType: 'Singles' })).toEqual([]);
  });

  it('offers nothing until both sides and the match type are known', () => {
    expect(getChallengeTitleOptions([title('world')], { ...singles, matchType: '' })).toEqual([]);
    expect(getChallengeTitleOptions([title('world')], { ...singles, sides: [[{ playerId: 'p1' }]] })).toEqual([]);
  });

  it('leaves out a division title when someone is outside the division', () => {
    const sides = [[{ playerId: 'p1', divisionId: 'd1' }], [{ playerId: 'p2' }]];
    expect(getChallengeTitleOptions([title('locked', { divisionId: 'd1' })], { ...singles, sides })).toEqual([]);
  });
});
