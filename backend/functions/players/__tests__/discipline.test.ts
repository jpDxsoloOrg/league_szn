import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyHandler, APIGatewayProxyResult, Context } from 'aws-lambda';

const { mockSend, mockCreateNotification, cognitoCalls } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockCreateNotification: vi.fn(),
  cognitoCalls: [] as string[],
}));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn(() => ({ send: mockSend })),
  AdminDisableUserCommand: vi.fn((input: Record<string, unknown>) => ({ type: 'disable', ...input })),
  AdminEnableUserCommand: vi.fn((input: Record<string, unknown>) => ({ type: 'enable', ...input })),
  AdminGetUserCommand: vi.fn((input: Record<string, unknown>) => ({ type: 'get', ...input })),
  AdminListGroupsForUserCommand: vi.fn((input: Record<string, unknown>) => ({ type: 'groups', ...input })),
}));
vi.mock('../../../lib/notifications', () => ({ createNotification: mockCreateNotification }));
vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { ConcurrencyError } from '../../../lib/repositories/errors';
import type { Player, PlayerDeactivation, PlayerStrike } from '../../../lib/repositories/types';
import type { DisciplineActionResult, PlayerDisciplineDetail } from '../../../lib/disciplineActions';
import { authedEvent, call } from '../../__tests__/visibilityTestHelpers';
import { handler as getPlayerDiscipline } from '../getPlayerDiscipline';
import { handler as issueStrike, strikeMessage } from '../issueStrike';
import { handler as removeStrike } from '../removeStrike';
import { handler as reactivatePlayer } from '../reactivatePlayer';
import { handler as deletePlayer } from '../deletePlayer';

const DAY_MS = 24 * 60 * 60 * 1000;
const EPOCH = Date.parse('2026-03-01T12:00:00.000Z');
const iso = (day: number): string => new Date(EPOCH + day * DAY_MS).toISOString();
const setDay = (day: number): void => {
  vi.setSystemTime(EPOCH + day * DAY_MS);
};

const USER_SUB = 'player-sub';
const REASON = 'Missed the show';

let repos: Repositories;
let playerId: string;
/** What the fake Cognito answers. */
let cognito: { groups: string[]; enabled: boolean; email: string };

const userNotFound = () => Object.assign(new Error('no user'), { name: 'UserNotFoundException' });

function strikeRow(day: number, overrides: Partial<PlayerStrike> = {}): PlayerStrike {
  return { strikeId: `s${day}`, issuedAt: iso(day), issuedBy: 'a', issuedByName: 'A', reason: 'Reason', ...overrides };
}

const openDeactivation = (day: number, overrides: Partial<PlayerDeactivation> = {}): PlayerDeactivation => ({
  deactivatedAt: iso(day),
  deactivatedBy: 'a',
  deactivatedByName: 'A',
  strikeId: `s${day}`,
  ...overrides,
});

const store = () => (repos.roster as unknown as { playersStore: Map<string, Player> }).playersStore;
const row = (): Player => store().get(playerId)!;
const seed = (fields: Partial<Player>): void => {
  store().set(playerId, { ...row(), ...fields });
};
const seedDeactivated = (days: number[], overrides: Partial<PlayerDeactivation> = {}): void => {
  const last = days[days.length - 1];
  seed({
    strikes: days.map((day) => strikeRow(day)),
    deactivations: [openDeactivation(last, overrides)],
    deactivatedAt: iso(last),
    disciplineVersion: days.length,
  });
};

const cognitoSent = (type: string): boolean => cognitoCalls.includes(type);

function post(
  handler: APIGatewayProxyHandler,
  body: Record<string, unknown>,
  pathParameters: Record<string, string> = {},
) {
  return call<DisciplineActionResult & { code?: string; message?: string }>(handler, authedEvent('admin-sub', 'Admin', {
    httpMethod: 'POST',
    pathParameters: { playerId, ...pathParameters },
    body: JSON.stringify(body),
  }));
}

const strike = (expectedOutcome: string, expectedVersion = row().disciplineVersion ?? 0) =>
  post(issueStrike, { reason: REASON, expectedVersion, expectedOutcome });

const remove = (strikeId: string, expectedVersion = row().disciplineVersion ?? 0) =>
  post(removeStrike, { reason: REASON, expectedVersion }, { strikeId });

const reactivate = (options: Record<string, unknown> = {}) =>
  post(reactivatePlayer, { reason: REASON, expectedVersion: row().disciplineVersion ?? 0, ...options });

const readDetail = () =>
  call<PlayerDisciplineDetail>(getPlayerDiscipline, authedEvent('mod-sub', 'Moderator', { pathParameters: { playerId } }));

const addPendingChallenge = async (): Promise<string> =>
  (await repos.user.challenges.create({
    challengerId: playerId,
    challengedId: 'other',
    matchType: 'singles',
    expiresAt: '2030-01-01T00:00:00.000Z',
  })).challengeId;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  setDay(0);
  cognitoCalls.length = 0;
  cognito = { groups: ['Wrestler'], enabled: true, email: 'Some.One+tag@Gmail.com' };
  mockCreateNotification.mockReset();
  mockCreateNotification.mockResolvedValue(undefined);
  mockSend.mockReset();
  mockSend.mockImplementation(async (command: { type: string }) => {
    cognitoCalls.push(command.type);
    if (command.type === 'groups') return { Groups: cognito.groups.map((GroupName) => ({ GroupName })) };
    if (command.type === 'get') {
      return { Enabled: cognito.enabled, UserAttributes: [{ Name: 'email', Value: cognito.email }] };
    }
    return {};
  });
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  const created = await repos.roster.players.create({ name: 'Rock', currentWrestler: 'The Rock' });
  playerId = created.playerId;
  await repos.roster.players.update(playerId, { userId: USER_SUB });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('issueStrike', () => {
  it('clear to warned: stores the strike, notifies, touches no login', async () => {
    const { statusCode, body } = await strike('warned');

    expect(statusCode).toBe(201);
    expect(body).toMatchObject({
      playerId,
      version: 1,
      accountSync: 'not-needed',
      softHoldsCleared: true,
      summary: { status: 'warned', cooldownEndsAt: iso(7) },
    });
    expect(row().strikes?.[0]).toMatchObject({ issuedAt: iso(0), issuedBy: 'admin-sub', issuedByName: 'admin-sub', reason: REASON });
    expect(row().signupGuardKey).toBeUndefined();
    expect(cognitoSent('get')).toBe(false);
    expect(mockCreateNotification).toHaveBeenCalledWith({
      userId: USER_SUB,
      type: 'strike_issued',
      message: 'You received a strike. Check your profile for details.',
      sourceId: row().strikes?.[0].strikeId,
      sourceType: 'discipline',
    });
  });

  it('names the Admin by their player name when they have one', async () => {
    const { playerId: adminPlayerId } = await repos.roster.players.create({ name: 'The GM', currentWrestler: 'X' });
    await repos.roster.players.update(adminPlayerId, { userId: 'admin-sub' });

    await strike('warned');

    expect(row().strikes?.[0].issuedByName).toBe('The GM');
  });

  it('warned to signup-blocked: clears soft holds, stores the guard key, notifies', async () => {
    seed({ strikes: [strikeRow(0)], disciplineVersion: 1 });
    setDay(3);
    const challengeId = await addPendingChallenge();

    const { statusCode, body } = await strike('signup-blocked');

    expect(statusCode).toBe(201);
    expect(body).toMatchObject({
      accountSync: 'not-needed',
      softHoldsCleared: true,
      summary: { status: 'signup-blocked', signupBlockedUntil: iso(10), cooldownEndsAt: iso(17) },
    });
    expect(row().signupGuardKey).toBe('someone@gmail.com');
    expect((await repos.user.challenges.findById(challengeId))?.status).toBe('cancelled');
    expect(cognitoSent('disable')).toBe(false);
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
      message: 'You received a second strike. You cannot sign up for matches for 7 days.',
    }));
  });

  it.each([
    ['signup-blocked, in the first week', 8],
    ['cooldown', 13],
  ])('%s to deactivated', async (_label, day) => {
    seed({ strikes: [strikeRow(0), strikeRow(5)], disciplineVersion: 2 });
    setDay(day);
    const challengeId = await addPendingChallenge();

    const { statusCode, body } = await strike('deactivated');

    expect(statusCode).toBe(201);
    expect(body).toMatchObject({
      accountSync: 'ok',
      softHoldsCleared: true,
      summary: { status: 'deactivated', activeStrikeCount: 3, deactivatedAt: iso(day), cooldownEndsAt: null },
    });
    expect(row().deactivatedAt).toBe(iso(day));
    expect(row().deactivations).toEqual([{
      deactivatedAt: iso(day),
      deactivatedBy: 'admin-sub',
      deactivatedByName: 'admin-sub',
      strikeId: row().strikes?.[2].strikeId,
    }]);
    expect(row().signupGuardKey).toBe('someone@gmail.com');
    expect(cognitoSent('disable')).toBe(true);
    expect((await repos.user.challenges.findById(challengeId))?.status).toBe('cancelled');
  });

  it('sends no notification on the deactivating strike', async () => {
    seed({ strikes: [strikeRow(0), strikeRow(5)], disciplineVersion: 2 });
    setDay(6);

    await strike('deactivated');

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('returns holdings on the deactivating strike', async () => {
    seed({ strikes: [strikeRow(0), strikeRow(5)], disciplineVersion: 2 });
    setDay(6);
    await repos.competition.championships.create({ name: 'World', type: 'singles', currentChampion: playerId } as Parameters<Repositories['competition']['championships']['create']>[0]);

    const { body } = await strike('deactivated');

    expect(body.holdings.titles).toEqual([expect.objectContaining({ name: 'World' })]);
  });

  it('disables the login before clearing soft holds', async () => {
    seed({ strikes: [strikeRow(0), strikeRow(5)], disciplineVersion: 2 });
    setDay(6);
    const order: string[] = [];
    mockSend.mockImplementation(async (command: { type: string }) => {
      order.push(command.type);
      return command.type === 'groups' ? { Groups: [] } : { Enabled: true, UserAttributes: [] };
    });
    vi.spyOn(repos.leagueOps.matchmaking, 'deletePresence').mockImplementation(async () => {
      order.push('clearSoftHolds');
    });

    await strike('deactivated');

    expect(order.indexOf('disable')).toBeGreaterThan(-1);
    expect(order.indexOf('disable')).toBeLessThan(order.indexOf('clearSoftHolds'));
  });

  it('keeps the row when disable fails, and reports it', async () => {
    seed({ strikes: [strikeRow(0), strikeRow(5)], disciplineVersion: 2 });
    setDay(6);
    mockSend.mockImplementation(async (command: { type: string }) => {
      if (command.type === 'disable') throw new Error('throttled');
      return command.type === 'groups' ? { Groups: [] } : { Enabled: true, UserAttributes: [] };
    });

    const { statusCode, body } = await strike('deactivated');

    expect(statusCode).toBe(201);
    expect(body.accountSync).toBe('failed');
    expect(row().deactivatedAt).toBe(iso(6));
  });

  it('records an already disabled login and leaves it alone', async () => {
    seed({ strikes: [strikeRow(0), strikeRow(5)], disciplineVersion: 2 });
    setDay(6);
    cognito.enabled = false;

    const { body } = await strike('deactivated');

    expect(body.accountSync).toBe('not-needed');
    expect(row().deactivations?.[0].cognitoAlreadyDisabled).toBe(true);
    expect(cognitoSent('disable')).toBe(false);
  });

  it('reports softHoldsCleared false when cleanup fails, with the strike still written', async () => {
    seed({ strikes: [strikeRow(0)], disciplineVersion: 1 });
    setDay(3);
    vi.spyOn(repos.leagueOps.matchmaking, 'deleteQueue').mockRejectedValueOnce(new Error('throttled'));

    const { statusCode, body } = await strike('signup-blocked');

    expect(statusCode).toBe(201);
    expect(body.softHoldsCleared).toBe(false);
    expect(row().strikes).toHaveLength(2);
  });

  it('still succeeds when the notification fails', async () => {
    mockCreateNotification.mockRejectedValue(new Error('down'));

    expect((await strike('warned')).statusCode).toBe(201);
  });

  it.each(['Admin', 'Moderator'])('refuses a linked %s with STAFF_PROTECTED and writes nothing', async (group) => {
    cognito.groups = [group];

    const { statusCode, body } = await strike('warned');

    expect(statusCode).toBe(409);
    expect(body.code).toBe('STAFF_PROTECTED');
    expect(row().strikes).toBeUndefined();
  });

  it('gives 500 and writes nothing on a Cognito error', async () => {
    mockSend.mockRejectedValue(new Error('throttled'));

    expect((await strike('warned')).statusCode).toBe(500);
    expect(row().strikes).toBeUndefined();
  });

  it('refuses a deactivated player with ALREADY_DEACTIVATED', async () => {
    seedDeactivated([0, 5, 6]);
    setDay(7);

    const { statusCode, body } = await strike('deactivated');

    expect(statusCode).toBe(409);
    expect(body.code).toBe('ALREADY_DEACTIVATED');
  });

  describe('an unlinked player', () => {
    beforeEach(() => {
      const { userId: _unlinked, ...rest } = row();
      store().set(playerId, rest);
    });

    it('takes a warning with no Cognito call and no notification', async () => {
      const { statusCode, body } = await strike('warned');

      expect(statusCode).toBe(201);
      expect(body.accountSync).toBe('not-needed');
      expect(mockSend).not.toHaveBeenCalled();
      expect(mockCreateNotification).not.toHaveBeenCalled();
    });

    it('is deactivated with not-linked', async () => {
      seed({ strikes: [strikeRow(0), strikeRow(5)], disciplineVersion: 2 });
      setDay(6);

      const { body } = await strike('deactivated');

      expect(body.accountSync).toBe('not-linked');
      expect(row().deactivatedAt).toBe(iso(6));
      expect(row().signupGuardKey).toBeUndefined();
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('a dead link', () => {
    beforeEach(() => {
      seed({ strikes: [strikeRow(0), strikeRow(5)], disciplineVersion: 2 });
      setDay(6);
    });

    it.each(['groups', 'get', 'disable'])('gives not-linked when %s finds no user', async (failing) => {
      mockSend.mockImplementation(async (command: { type: string }) => {
        if (command.type === failing) throw userNotFound();
        return command.type === 'groups' ? { Groups: [] } : { Enabled: true, UserAttributes: [] };
      });

      const { statusCode, body } = await strike('deactivated');

      expect(statusCode).toBe(201);
      expect(body.accountSync).toBe('not-linked');
      expect(row().deactivatedAt).toBe(iso(6));
    });

    it('skips the notification', async () => {
      seed({ strikes: [], disciplineVersion: 0 });
      mockSend.mockRejectedValue(userNotFound());

      await strike('warned');

      expect(mockCreateNotification).not.toHaveBeenCalled();
    });
  });

  describe('DISCIPLINE_CONFLICT', () => {
    const expectConflictWithNoWrite = async (result: Awaited<ReturnType<typeof strike>>, before: Player) => {
      expect(result.statusCode).toBe(409);
      expect(result.body.code).toBe('DISCIPLINE_CONFLICT');
      expect(row()).toEqual(before);
      expect(cognitoSent('disable')).toBe(false);
      expect(mockCreateNotification).not.toHaveBeenCalled();
    };

    it('refuses a stale version on a player in cooldown', async () => {
      seed({ strikes: [strikeRow(0), strikeRow(5)], disciplineVersion: 2 });
      setDay(13);
      const before = row();

      await expectConflictWithNoWrite(await strike('deactivated', 1), before);
    });

    it('stops two Admins both sending a second strike at one warned row', async () => {
      seed({ strikes: [strikeRow(0)], disciplineVersion: 1 });
      setDay(3);

      expect((await strike('signup-blocked', 1)).statusCode).toBe(201);
      const before = row();
      mockCreateNotification.mockClear();

      await expectConflictWithNoWrite(await strike('signup-blocked', 1), before);
    });

    it('refuses a deactivating strike that lands after the cooldown ended, version unchanged', async () => {
      seed({ strikes: [strikeRow(0), strikeRow(5)], disciplineVersion: 2 });
      setDay(19);
      const before = row();

      await expectConflictWithNoWrite(await strike('deactivated', 2), before);
    });

    it('answers a lost write race the same way', async () => {
      vi.spyOn(repos.roster.players, 'updateDiscipline').mockRejectedValueOnce(new ConcurrencyError('Player', playerId));

      const { statusCode, body } = await strike('warned');

      expect(statusCode).toBe(409);
      expect(body.code).toBe('DISCIPLINE_CONFLICT');
      expect(mockCreateNotification).not.toHaveBeenCalled();
    });
  });

  it.each([
    ['a bad reason', { reason: 'x', expectedVersion: 0, expectedOutcome: 'warned' }],
    ['no expectedVersion', { reason: REASON, expectedOutcome: 'warned' }],
    ['a negative expectedVersion', { reason: REASON, expectedVersion: -1, expectedOutcome: 'warned' }],
    ['no expectedOutcome', { reason: REASON, expectedVersion: 0 }],
    ['an unknown expectedOutcome', { reason: REASON, expectedVersion: 0, expectedOutcome: 'banned' }],
  ])('gives 400 for %s', async (_label, body) => {
    expect((await post(issueStrike, body)).statusCode).toBe(400);
  });

  it('gives 404 for a missing player', async () => {
    playerId = 'nobody';
    store().delete('nobody');

    const result = await call(issueStrike, authedEvent('admin-sub', 'Admin', {
      pathParameters: { playerId },
      body: JSON.stringify({ reason: REASON, expectedVersion: 0, expectedOutcome: 'warned' }),
    }));

    expect(result.statusCode).toBe(404);
  });

  it('refuses a Moderator', async () => {
    const result = await call(issueStrike, authedEvent('mod-sub', 'Moderator', {
      pathParameters: { playerId },
      body: JSON.stringify({ reason: REASON, expectedVersion: 0, expectedOutcome: 'warned' }),
    }));

    expect(result.statusCode).toBe(403);
  });

  it('words a strike that restarts the block, for when the window start is raised', () => {
    expect(strikeMessage('signup-blocked', 2)).toBe('You received another strike. You cannot sign up for matches for 7 days from now.');
  });
});

describe('removeStrike', () => {
  it('removes the only strike: clear, kept in history, notified', async () => {
    seed({ strikes: [strikeRow(0)], disciplineVersion: 1 });
    setDay(1);

    const { statusCode, body } = await remove('s0');

    expect(statusCode).toBe(200);
    expect(body).toMatchObject({ version: 2, accountSync: 'not-needed', softHoldsCleared: true, summary: { status: 'clear' } });
    expect(row().strikes?.[0]).toMatchObject({
      clearedAt: iso(1),
      clearedBy: 'admin-sub',
      clearedReason: REASON,
      clearedKind: 'removed',
    });
    expect(mockCreateNotification).toHaveBeenCalledWith({
      userId: USER_SUB,
      type: 'strike_removed',
      message: 'A strike was removed from your account.',
      sourceId: 's0',
      sourceType: 'discipline',
    });
    expect(cognitoSent('enable')).toBe(false);
  });

  it('removes strike 1 of 2: strike 2 becomes a warning from its own date', async () => {
    seed({ strikes: [strikeRow(0), strikeRow(5)], disciplineVersion: 2 });
    setDay(6);

    const { body } = await remove('s0');

    expect(body.summary).toMatchObject({ status: 'warned', cooldownEndsAt: iso(12), signupBlockedUntil: null });
  });

  it('removes strike 2 of 2: strike 1 resumes its own 7 days', async () => {
    seed({ strikes: [strikeRow(0), strikeRow(5)], disciplineVersion: 2 });
    setDay(6);

    expect((await remove('s5')).body.summary).toMatchObject({ status: 'warned', cooldownEndsAt: iso(7) });
  });

  it('removes strike 2 of 2 after strike 1 lapsed: clear', async () => {
    seed({ strikes: [strikeRow(0), strikeRow(5)], disciplineVersion: 2 });
    setDay(8);

    expect((await remove('s5')).body.summary.status).toBe('clear');
  });

  it('skips the notification for an unlinked player', async () => {
    const { userId: _unlinked, ...rest } = row();
    store().set(playerId, { ...rest, strikes: [strikeRow(0)], disciplineVersion: 1 });
    setDay(1);

    expect((await remove('s0')).statusCode).toBe(200);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('still succeeds when the notification fails', async () => {
    seed({ strikes: [strikeRow(0)], disciplineVersion: 1 });
    setDay(1);
    mockCreateNotification.mockRejectedValue(new Error('down'));

    expect((await remove('s0')).statusCode).toBe(200);
  });

  it.each([
    ['lapsed', () => seed({ strikes: [strikeRow(0)], disciplineVersion: 1 }), 7],
    ['cleared', () => seed({ strikes: [strikeRow(0, { clearedAt: iso(1) })], disciplineVersion: 2 }), 2],
  ])('refuses a %s strike with STRIKE_NOT_ACTIVE and no notification', async (_label, arrange, day) => {
    arrange();
    setDay(day);
    const before = row();

    const { statusCode, body } = await remove('s0');

    expect(statusCode).toBe(409);
    expect(body.code).toBe('STRIKE_NOT_ACTIVE');
    expect(row()).toEqual(before);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('refuses a deactivated player with PLAYER_DEACTIVATED', async () => {
    seedDeactivated([0, 5, 6]);

    const { statusCode, body } = await remove('s6');

    expect(statusCode).toBe(409);
    expect(body.code).toBe('PLAYER_DEACTIVATED');
  });

  it('refuses a stale version', async () => {
    seed({ strikes: [strikeRow(0)], disciplineVersion: 1 });
    setDay(1);
    const before = row();

    const { statusCode, body } = await remove('s0', 0);

    expect(statusCode).toBe(409);
    expect(body.code).toBe('DISCIPLINE_CONFLICT');
    expect(row()).toEqual(before);
  });

  it('answers a lost write race with DISCIPLINE_CONFLICT', async () => {
    seed({ strikes: [strikeRow(0)], disciplineVersion: 1 });
    setDay(1);
    vi.spyOn(repos.roster.players, 'updateDiscipline').mockRejectedValueOnce(new ConcurrencyError('Player', playerId));

    expect((await remove('s0')).body.code).toBe('DISCIPLINE_CONFLICT');
  });

  it('gives 404 for an unknown strike', async () => {
    seed({ strikes: [strikeRow(0)], disciplineVersion: 1 });

    expect((await remove('nope')).statusCode).toBe(404);
  });

  it('gives 400 for a bad reason', async () => {
    seed({ strikes: [strikeRow(0)], disciplineVersion: 1 });

    const { statusCode } = await post(removeStrike, { reason: '', expectedVersion: 1 }, { strikeId: 's0' });

    expect(statusCode).toBe(400);
  });
});

describe('reactivatePlayer', () => {
  it('clears active strikes, keeps history, enables the login, notifies', async () => {
    seedDeactivated([0, 5, 13]);
    setDay(20);

    const { statusCode, body } = await reactivate();

    expect(statusCode).toBe(200);
    expect(body).toMatchObject({ accountSync: 'ok', softHoldsCleared: true, summary: { status: 'clear', activeStrikeCount: 0 } });
    expect(row()).not.toHaveProperty('deactivatedAt');
    expect(row().strikes).toHaveLength(3);
    expect(row().strikes?.every((entry) => entry.clearedKind === 'reactivated' && entry.clearedAt === iso(20))).toBe(true);
    expect(row().deactivations?.[0]).toMatchObject({
      reactivatedAt: iso(20),
      reactivatedBy: 'admin-sub',
      reactivationReason: REASON,
    });
    expect(cognitoSent('enable')).toBe(true);
    expect(mockCreateNotification).toHaveBeenCalledWith({
      userId: USER_SUB,
      type: 'account_reactivated',
      message: 'Your account has been reactivated.',
      sourceId: playerId,
      sourceType: 'discipline',
    });
  });

  it('leaves a strike that lapsed before deactivation as it was', async () => {
    seedDeactivated([0, 20, 22, 30]);
    setDay(31);

    await reactivate();

    const [lapsed, ...cleared] = row().strikes ?? [];
    expect(lapsed.clearedAt).toBeUndefined();
    expect(cleared.every((entry) => entry.clearedKind === 'reactivated')).toBe(true);
  });

  describe('restorePriorStrikes', () => {
    beforeEach(() => {
      seedDeactivated([0, 5, 13]);
      setDay(13.5);
    });

    it('clears only the deactivating strike, and the rest keep their own dates', async () => {
      const { body } = await reactivate({ restorePriorStrikes: true });

      expect(body.summary).toMatchObject({ status: 'cooldown', activeStrikeCount: 2, cooldownEndsAt: iso(19) });
      expect(row().strikes?.map((entry) => entry.clearedAt)).toEqual([undefined, undefined, iso(13.5)]);
    });

    it('reaches clear on the original date', async () => {
      await reactivate({ restorePriorStrikes: true });
      setDay(18.999);
      expect((await readDetail()).body.summary.status).toBe('cooldown');

      setDay(19);
      expect((await readDetail()).body.summary.status).toBe('clear');
    });

    it('gives clear straight away when those windows have passed', async () => {
      setDay(30);

      expect((await reactivate({ restorePriorStrikes: true })).body.summary.status).toBe('clear');
    });

    it('lets the next strike after a restore deactivate, inside the original cooldown', async () => {
      await reactivate({ restorePriorStrikes: true });

      expect((await readDetail()).body.nextStrikeOutcome).toBe('deactivated');
    });
  });

  it('skips enable when the login was already disabled at strike 3', async () => {
    seedDeactivated([0, 5, 6], { cognitoAlreadyDisabled: true });

    const { body } = await reactivate();

    expect(body.accountSync).toBe('not-needed');
    expect(cognitoSent('enable')).toBe(false);
  });

  it('stamps only the open deactivation', async () => {
    seedDeactivated([0, 5, 6]);
    const closed = openDeactivation(-40, { reactivatedAt: iso(-30) });
    seed({ deactivations: [closed, ...(row().deactivations ?? [])] });

    await reactivate();

    expect(row().deactivations?.[0]).toEqual(closed);
    expect(row().deactivations?.[1].reactivatedAt).toBeDefined();
  });

  it('reports a failed enable, and a reload shows the disagreement', async () => {
    seedDeactivated([0, 5, 6]);
    cognito.enabled = false;
    mockSend.mockImplementation(async (command: { type: string }) => {
      if (command.type === 'enable') throw new Error('throttled');
      return command.type === 'groups' ? { Groups: [] } : { Enabled: cognito.enabled, UserAttributes: [] };
    });

    const { statusCode, body } = await reactivate();

    expect(statusCode).toBe(200);
    expect(body.accountSync).toBe('failed');
    expect((await readDetail()).body).toMatchObject({ summary: { status: 'clear' }, accountEnabled: false });
  });

  it('gives not-linked on a dead link', async () => {
    seedDeactivated([0, 5, 6]);
    mockSend.mockRejectedValue(userNotFound());

    expect((await reactivate()).body.accountSync).toBe('not-linked');
  });

  it('skips Cognito and the notification for an unlinked player', async () => {
    seedDeactivated([0, 5, 6]);
    const { userId: _unlinked, ...rest } = row();
    store().set(playerId, rest);

    const { statusCode, body } = await reactivate();

    expect(statusCode).toBe(200);
    expect(body.accountSync).toBe('not-linked');
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('still succeeds when the notification fails', async () => {
    seedDeactivated([0, 5, 6]);
    mockCreateNotification.mockRejectedValue(new Error('down'));

    expect((await reactivate()).statusCode).toBe(200);
  });

  it('refuses a player who is not deactivated', async () => {
    const { statusCode, body } = await reactivate();

    expect(statusCode).toBe(409);
    expect(body.code).toBe('NOT_DEACTIVATED');
  });

  it('refuses a stale version and leaves the player deactivated', async () => {
    seedDeactivated([0, 5, 6]);

    const { statusCode, body } = await reactivate({ expectedVersion: 1 });

    expect(statusCode).toBe(409);
    expect(body.code).toBe('DISCIPLINE_CONFLICT');
    expect(row().deactivatedAt).toBe(iso(6));
    expect(cognitoSent('enable')).toBe(false);
  });

  it('gives 400 for a restorePriorStrikes that is not a boolean', async () => {
    seedDeactivated([0, 5, 6]);

    expect((await reactivate({ restorePriorStrikes: 'yes' })).statusCode).toBe(400);
  });
});

describe('getPlayerDiscipline', () => {
  it('reads a clean player', async () => {
    const { statusCode, body } = await readDetail();

    expect(statusCode).toBe(200);
    expect(body).toEqual({
      playerId,
      version: 0,
      summary: { status: 'clear', activeStrikeCount: 0, activeStrikes: [], cooldownEndsAt: null, signupBlockedUntil: null, deactivatedAt: null },
      nextStrikeOutcome: 'warned',
      strikes: [],
      deactivations: [],
      hasLinkedAccount: true,
      isStaffAccount: false,
      accountEnabled: true,
      holdings: { titles: [], matches: [], challenges: [], tournaments: [] },
    });
  });

  it('gives history newest first, with the version to send back', async () => {
    seed({ strikes: [strikeRow(0), strikeRow(5)], disciplineVersion: 2 });
    setDay(6);

    const { body } = await readDetail();

    expect(body.version).toBe(2);
    expect(body.nextStrikeOutcome).toBe('deactivated');
    expect(body.strikes.map((entry) => entry.strikeId)).toEqual(['s5', 's0']);
  });

  describe('staff names on stored rows', () => {
    const ADMIN_ID = 'b4281418-1081-7085-201f-a2a5c546b74e';
    const LINKED_ID = '11111111-2222-3333-4444-555555555555';

    it('shows League Staff for an account id with no player, in every name on the history', async () => {
      seed({
        strikes: [strikeRow(0, {
          issuedByName: ADMIN_ID,
          clearedAt: iso(1),
          clearedByName: ADMIN_ID,
          clearedKind: 'removed',
        })],
        deactivations: [openDeactivation(0, {
          deactivatedByName: ADMIN_ID,
          reactivatedAt: iso(1),
          reactivatedByName: ADMIN_ID,
        })],
      });
      setDay(2);

      const { body } = await readDetail();

      expect(body.strikes[0]).toMatchObject({ issuedByName: 'League Staff', clearedByName: 'League Staff' });
      expect(body.deactivations[0]).toMatchObject({ deactivatedByName: 'League Staff', reactivatedByName: 'League Staff' });
      expect(JSON.stringify(row())).toContain(ADMIN_ID);
    });

    it('names a staff member who has since linked a player, and keeps a readable name', async () => {
      const staffPlayer = await repos.roster.players.create({ name: 'JP', currentWrestler: 'Sting' });
      store().set(staffPlayer.playerId, { ...staffPlayer, userId: LINKED_ID });
      seed({ strikes: [strikeRow(0, { issuedByName: LINKED_ID }), strikeRow(1, { issuedByName: 'Regal' })] });
      setDay(2);

      const { body } = await readDetail();

      expect(body.strikes.map((entry) => entry.issuedByName)).toEqual(['Regal', 'JP']);
    });

    it('stores League Staff rather than an account id for an Admin with no player row', async () => {
      await call(issueStrike, authedEvent(ADMIN_ID, 'Admin', {
        httpMethod: 'POST',
        pathParameters: { playerId },
        body: JSON.stringify({ reason: REASON, expectedVersion: 0, expectedOutcome: 'warned' }),
      }));

      expect(row().strikes?.[0].issuedByName).toBe('League Staff');
    });
  });

  it('gives a null next outcome while deactivated', async () => {
    seedDeactivated([0, 5, 6]);

    expect((await readDetail()).body.nextStrikeOutcome).toBeNull();
  });

  it('flags a staff account', async () => {
    cognito.groups = ['Moderator'];

    expect((await readDetail()).body.isStaffAccount).toBe(true);
  });

  it('returns 200 with no link on a dead link', async () => {
    mockSend.mockRejectedValue(userNotFound());

    const { statusCode, body } = await readDetail();

    expect(statusCode).toBe(200);
    expect(body).toMatchObject({ hasLinkedAccount: false, isStaffAccount: false, accountEnabled: null });
  });

  it('returns 200 with nulls on a Cognito error', async () => {
    mockSend.mockRejectedValue(new Error('throttled'));

    const { statusCode, body } = await readDetail();

    expect(statusCode).toBe(200);
    expect(body).toMatchObject({ hasLinkedAccount: true, isStaffAccount: null, accountEnabled: null });
  });

  it('gives 404 for a missing player', async () => {
    const result = await call(getPlayerDiscipline, authedEvent('mod-sub', 'Moderator', { pathParameters: { playerId: 'nobody' } }));

    expect(result.statusCode).toBe(404);
  });

  it('refuses a Wrestler', async () => {
    const result = await call(getPlayerDiscipline, authedEvent('w-sub', 'Wrestler', { pathParameters: { playerId } }));

    expect(result.statusCode).toBe(403);
  });
});

describe('a delete racing a strike', () => {
  // A successful delete has no body, so `call` cannot be used here.
  const del = async () => {
    const event = authedEvent('admin-sub', 'Admin', { httpMethod: 'DELETE', pathParameters: { playerId } });
    const { statusCode, body } = (await deletePlayer(event, {} as Context, () => {})) as APIGatewayProxyResult;
    return { statusCode, body: (body ? JSON.parse(body) : {}) as { code?: string } };
  };

  /** Lands `write` after the delete has checked the row, and before its last write. */
  const duringDelete = (write: () => Promise<unknown>): void => {
    vi.spyOn(repos.season.standings, 'listByPlayer').mockImplementationOnce(async () => {
      await write();
      return [];
    });
  };

  it('keeps a live deactivation, so reactivation still has a row to work on', async () => {
    // Two lapsed strikes read as clear, so the delete passes its first check.
    seed({ psnId: 'Rock_PSN', strikes: [strikeRow(0), strikeRow(1)], deactivations: [], disciplineVersion: 2 });
    setDay(40);
    duringDelete(() => repos.roster.players.updateDiscipline(playerId, {
      strikes: [strikeRow(0), strikeRow(1), strikeRow(40)],
      deactivations: [openDeactivation(40)],
      deactivatedAt: iso(40),
    }, 2));

    const { statusCode, body } = await del();

    expect(statusCode).toBe(409);
    expect(body.code).toBe('PLAYER_DEACTIVATED');
    expect(row().deletedAt).toBeUndefined();
    expect(row().userId).toBe(USER_SUB);
    expect(row().psnId).toBe('Rock_PSN');
    expect((await reactivate()).statusCode).toBe(200);
  });

  it('refuses for active strikes when a warning lands', async () => {
    setDay(0);
    duringDelete(() => repos.roster.players.updateDiscipline(playerId, {
      strikes: [strikeRow(0)],
      deactivations: [],
      deactivatedAt: null,
    }, 0));

    const { statusCode, body } = await del();

    expect(statusCode).toBe(409);
    expect(body.code).toBe('DISCIPLINE_ACTIVE');
    expect(row().deletedAt).toBeUndefined();
  });

  it('asks for a retry when the record changed but the player is clear again', async () => {
    seed({ strikes: [strikeRow(0)], deactivations: [], disciplineVersion: 1 });
    setDay(40);
    duringDelete(() => repos.roster.players.updateDiscipline(playerId, {
      strikes: [strikeRow(0, { clearedAt: iso(40) })],
      deactivations: [],
      deactivatedAt: null,
    }, 1));

    const { statusCode, body } = await del();

    expect(statusCode).toBe(409);
    expect(body.code).toBe('DISCIPLINE_CONFLICT');
    expect(row().deletedAt).toBeUndefined();
    expect((await del()).statusCode).toBe(204);
  });

  it('deletes as before when nothing changed', async () => {
    expect((await del()).statusCode).toBe(204);
    expect(row().deletedAt).toBeDefined();
  });
});

describe('a full walk', () => {
  it('strike 1, 2, 3, reactivate, then a fresh first strike', async () => {
    expect((await strike('warned')).body.summary.status).toBe('warned');

    setDay(3);
    expect((await strike('signup-blocked')).body.summary.status).toBe('signup-blocked');

    setDay(5);
    expect((await readDetail()).body.nextStrikeOutcome).toBe('deactivated');
    expect((await strike('deactivated')).body.summary.status).toBe('deactivated');

    setDay(9);
    expect((await reactivate()).body.summary.status).toBe('clear');

    setDay(10);
    expect((await strike('warned')).body.summary).toMatchObject({ status: 'warned', activeStrikeCount: 1, cooldownEndsAt: iso(17) });
  });
});
