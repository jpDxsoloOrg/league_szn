import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn(() => ({ send: mockSend })),
  AdminDisableUserCommand: vi.fn((input: Record<string, unknown>) => ({ type: 'disable', ...input })),
  AdminEnableUserCommand: vi.fn((input: Record<string, unknown>) => ({ type: 'enable', ...input })),
  AdminGetUserCommand: vi.fn((input: Record<string, unknown>) => ({ type: 'get', ...input })),
  AdminListGroupsForUserCommand: vi.fn((input: Record<string, unknown>) => ({ type: 'groups', ...input })),
}));
vi.mock('../notifications', () => ({ createNotification: vi.fn() }));
vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});

import { buildInMemoryRepositories } from '../repositories/inMemory';
import {
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Repositories,
} from '../repositories';
import type { Challenge, ChallengeStatus } from '../repositories/types';
import {
  clearSoftHolds,
  disableAccount,
  enableAccount,
  findPlayerForCognitoUsername,
  getHoldings,
  readAccountView,
} from '../disciplineActions';

const userNotFound = () => Object.assign(new Error('no user'), { name: 'UserNotFoundException' });

let repos: Repositories;

async function addChallenge(overrides: Partial<Challenge>, status: ChallengeStatus = 'pending'): Promise<string> {
  const { challengeId } = await repos.user.challenges.create({
    challengerId: 'other-1',
    challengedId: 'other-2',
    matchType: 'singles',
    expiresAt: '2030-01-01T00:00:00.000Z',
    ...overrides,
  } as Parameters<Repositories['user']['challenges']['create']>[0]);
  await repos.user.challenges.update(challengeId, { status });
  return challengeId;
}

async function addTeam(player1Id: string, player2Id: string, name: string): Promise<string> {
  return (await repos.roster.tagTeams.create({ name, player1Id, player2Id, status: 'active' })).tagTeamId;
}

const statusOf = async (challengeId: string) => (await repos.user.challenges.findById(challengeId))?.status;

beforeEach(() => {
  mockSend.mockReset();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.restoreAllMocks();
});

describe('clearSoftHolds', () => {
  const invite = async (fromPlayerId: string, toPlayerId: string, invitationId: string) => {
    await repos.leagueOps.matchmaking.putInvitation({
      invitationId,
      fromPlayerId,
      toPlayerId,
      status: 'pending',
      expiresAt: '2030-01-01T00:00:00.000Z',
      ttl: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as Parameters<Repositories['leagueOps']['matchmaking']['putInvitation']>[0]);
  };

  it('clears presence, queue and invitations in both directions', async () => {
    const { matchmaking } = repos.leagueOps;
    await matchmaking.putPresence({ playerId: 'p1', lastSeenAt: 'x', ttl: 0 } as Parameters<typeof matchmaking.putPresence>[0]);
    await matchmaking.putQueue({ playerId: 'p1', joinedAt: 'x', ttl: 0 } as Parameters<typeof matchmaking.putQueue>[0]);
    await invite('p1', 'other', 'sent');
    await invite('other', 'p1', 'received');

    expect(await clearSoftHolds('p1')).toBe(true);

    expect(await matchmaking.getPresence('p1')).toBeNull();
    expect(await matchmaking.listQueue()).toEqual([]);
    expect((await matchmaking.getInvitation('sent'))?.status).toBe('expired');
    expect((await matchmaking.getInvitation('received'))?.status).toBe('expired');
  });

  it('leaves an invitation that moved on before the write', async () => {
    const { matchmaking } = repos.leagueOps;
    await invite('p1', 'other', 'raced');
    const realUpdate = matchmaking.updateInvitation.bind(matchmaking);
    vi.spyOn(matchmaking, 'updateInvitation').mockImplementationOnce(async (id, patch, condition) => {
      await realUpdate(id, { status: 'accepted' });
      return realUpdate(id, patch, condition);
    });

    expect(await clearSoftHolds('p1')).toBe(true);

    expect((await matchmaking.getInvitation('raced'))?.status).toBe('accepted');
  });

  it('cancels pending and countered challenges on either side', async () => {
    const sent = await addChallenge({ challengerId: 'p1' });
    const received = await addChallenge({ challengedId: 'p1' }, 'countered');

    await clearSoftHolds('p1');

    expect(await statusOf(sent)).toBe('cancelled');
    expect(await statusOf(received)).toBe('cancelled');
  });

  it('cancels a tag partner\'s challenge', async () => {
    const teamId = await addTeam('p1', 'partner', 'Team');
    const byPartner = await addChallenge({ challengerId: 'partner', challengerTagTeamId: teamId });
    const atPartner = await addChallenge({ challengedId: 'partner', challengedTagTeamId: teamId });

    await clearSoftHolds('p1');

    expect(await statusOf(byPartner)).toBe('cancelled');
    expect(await statusOf(atPartner)).toBe('cancelled');
  });

  it('leaves accepted challenges and other players\' challenges', async () => {
    const accepted = await addChallenge({ challengerId: 'p1' }, 'accepted');
    const unrelated = await addChallenge({});

    await clearSoftHolds('p1');

    expect(await statusOf(accepted)).toBe('accepted');
    expect(await statusOf(unrelated)).toBe('pending');
  });

  it('leaves a challenge that moved on before the write', async () => {
    const raced = await addChallenge({ challengerId: 'p1' });
    const { challenges } = repos.user;
    const realUpdateIfStatus = challenges.updateIfStatus.bind(challenges);
    vi.spyOn(challenges, 'updateIfStatus').mockImplementationOnce(async (id, patch, expected) => {
      await challenges.update(id, { status: 'accepted' });
      return realUpdateIfStatus(id, patch, expected);
    });

    expect(await clearSoftHolds('p1')).toBe(true);

    expect(await statusOf(raced)).toBe('accepted');
  });

  it('finishes the other steps and reports false when one fails', async () => {
    const challengeId = await addChallenge({ challengerId: 'p1' });
    vi.spyOn(repos.leagueOps.matchmaking, 'deleteQueue').mockRejectedValueOnce(new Error('throttled'));

    expect(await clearSoftHolds('p1')).toBe(false);

    expect(await statusOf(challengeId)).toBe('cancelled');
  });
});

describe('getHoldings', () => {
  const addMatch = (matchId: string, overrides: Record<string, unknown>) => {
    const { matchesStore } = repos.competition as unknown as { matchesStore: Map<string, Record<string, unknown>> };
    matchesStore.set(matchId, { matchId, date: '2026-05-01T00:00:00.000Z', participants: [], ...overrides });
  };

  it('is empty for a player with nothing', async () => {
    expect(await getHoldings('p1')).toEqual({ titles: [], matches: [], challenges: [], tournaments: [] });
  });

  it('lists singles and tag titles', async () => {
    const create = repos.competition.championships.create;
    const singles = await create({ name: 'World', type: 'singles', currentChampion: 'p1' } as Parameters<typeof create>[0]);
    const tag = await create({ name: 'Tag', type: 'tag', currentChampion: ['p1', 'partner'] } as Parameters<typeof create>[0]);
    await create({ name: 'Other', type: 'singles', currentChampion: 'other' } as Parameters<typeof create>[0]);

    const { titles } = await getHoldings('p1');

    expect(titles).toHaveLength(2);
    expect(titles).toEqual(expect.arrayContaining([
      { championshipId: singles.championshipId, name: 'World' },
      { championshipId: tag.championshipId, name: 'Tag' },
    ]));
  });

  it('lists scheduled and open matches, by participant or slot, and nothing finished', async () => {
    addMatch('scheduled', { participants: ['p1', 'other'], status: 'scheduled', eventId: 'e1' });
    addMatch('open', { status: 'open-signups', slots: [{ slotId: 'a', playerId: 'p1' }], tournamentId: 't1' });
    addMatch('done', { participants: ['p1'], status: 'completed' });
    addMatch('elsewhere', { participants: ['other'], status: 'scheduled' });

    const { matches } = await getHoldings('p1');

    expect(matches).toEqual(expect.arrayContaining([
      { matchId: 'scheduled', date: '2026-05-01T00:00:00.000Z', status: 'scheduled', opponents: [], eventId: 'e1' },
      { matchId: 'open', date: '2026-05-01T00:00:00.000Z', status: 'open-signups', opponents: [], tournamentId: 't1' },
    ]));
    expect(matches).toHaveLength(2);
  });

  it('lists accepted challenges with the opponent\'s name', async () => {
    const { playerId: opponentId } = await repos.roster.players.create({ name: 'Opponent', currentWrestler: 'X' });
    const challengeId = await addChallenge({ challengerId: 'p1', challengedId: opponentId }, 'accepted');
    await addChallenge({ challengerId: 'p1', challengedId: opponentId });

    expect((await getHoldings('p1')).challenges).toEqual([{ challengeId, opponentName: 'Opponent' }]);
  });

  it('lists an accepted challenge through a tag team, naming the other team', async () => {
    const mine = await addTeam('p1', 'partner', 'Mine');
    const theirs = await addTeam('x', 'y', 'Theirs');
    const challengeId = await addChallenge({
      challengerId: 'x',
      challengedId: 'partner',
      challengerTagTeamId: theirs,
      challengedTagTeamId: mine,
      challengeMode: 'tag_team',
    }, 'accepted');

    expect((await getHoldings('p1')).challenges).toEqual([{ challengeId, opponentName: 'Theirs' }]);
  });

  it('lists tournaments not yet completed that the player is in', async () => {
    const { tournamentsStore } = repos.competition as unknown as { tournamentsStore: Map<string, Record<string, unknown>> };
    const row = (tournamentId: string, status: string, participants: string[]) => {
      tournamentsStore.set(tournamentId, { tournamentId, name: tournamentId, status, participants, type: 'round-robin', createdAt: 'x' });
    };
    row('running', 'in-progress', ['p1']);
    row('upcoming', 'upcoming', ['p1']);
    row('done', 'completed', ['p1']);
    row('elsewhere', 'in-progress', ['other']);

    const { tournaments } = await getHoldings('p1');

    expect(tournaments.map((tournament) => tournament.tournamentId).sort()).toEqual(['running', 'upcoming']);
  });
});

describe('Cognito wrappers', () => {
  it.each([
    ['disable', disableAccount],
    ['enable', enableAccount],
  ])('%s reports ok, a dead link and a failure', async (_label, action) => {
    mockSend.mockResolvedValueOnce({});
    expect(await action('sub')).toBe('ok');

    mockSend.mockRejectedValueOnce(userNotFound());
    expect(await action('sub')).toBe('not-linked');

    mockSend.mockRejectedValueOnce(new Error('throttled'));
    expect(await action('sub')).toBe('failed');
  });

  describe('readAccountView', () => {
    it('reads as unlinked with no userId, and asks Cognito nothing', async () => {
      expect(await readAccountView(undefined)).toEqual({ hasLinkedAccount: false, isStaffAccount: false, accountEnabled: null });
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('reads a dead link as unlinked', async () => {
      mockSend.mockRejectedValue(userNotFound());

      expect(await readAccountView('sub')).toEqual({ hasLinkedAccount: false, isStaffAccount: false, accountEnabled: null });
    });

    it('gives nulls on a Cognito error', async () => {
      mockSend.mockRejectedValue(new Error('throttled'));

      expect(await readAccountView('sub')).toEqual({ hasLinkedAccount: true, isStaffAccount: null, accountEnabled: null });
    });

    it('reports a staff account and a disabled login', async () => {
      mockSend.mockImplementation(async (command: { type: string }) => (command.type === 'groups'
        ? { Groups: [{ GroupName: 'Wrestler' }, { GroupName: 'Moderator' }] }
        : { Enabled: false, UserAttributes: [] }));

      expect(await readAccountView('sub')).toEqual({ hasLinkedAccount: true, isStaffAccount: true, accountEnabled: false });
    });
  });

  describe('findPlayerForCognitoUsername', () => {
    it('finds the player through the sub', async () => {
      const { playerId } = await repos.roster.players.create({ name: 'Rock', currentWrestler: 'X' });
      await repos.roster.players.update(playerId, { userId: 'the-sub' });
      mockSend.mockResolvedValue({ UserAttributes: [{ Name: 'sub', Value: 'the-sub' }] });

      expect((await findPlayerForCognitoUsername('rock'))?.playerId).toBe(playerId);
    });

    it('gives null for an account with no player', async () => {
      mockSend.mockResolvedValue({ UserAttributes: [{ Name: 'sub', Value: 'nobody' }] });

      expect(await findPlayerForCognitoUsername('rock')).toBeNull();
    });

    it('lets a Cognito error through, so its guards fail closed', async () => {
      mockSend.mockRejectedValue(new Error('throttled'));

      await expect(findPlayerForCognitoUsername('rock')).rejects.toThrow('throttled');
    });
  });
});
