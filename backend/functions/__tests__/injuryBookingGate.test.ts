import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context, Callback } from 'aws-lambda';

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});

vi.mock('../../lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  createNotifications: vi.fn().mockResolvedValue(undefined),
}));

import { buildInMemoryRepositories } from '../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../lib/repositories';
import type { Match } from '../../lib/repositories/types';
import { handler as scheduleMatch } from '../matches/scheduleMatch';
import { handler as updateMatch } from '../matches/updateMatch';
import { handler as adminUpdateSlot } from '../matches/adminUpdateSlot';
import { handler as claimSlot } from '../matches/claimSlot';
import { handler as createChallenge } from '../challenges/createChallenge';
import { handler as respondToChallenge } from '../challenges/respondToChallenge';
import { handler as createTournament } from '../tournaments/createTournament';
import { injuryRefusal } from '../../lib/injuries/bookingGate';

const ctx = {} as Context;
const cb: Callback = () => {};

const NOW = new Date('2026-11-24T12:00:00Z');
const RETURNS_AT = '2026-12-06T00:00:00.000Z';
const PAST_RETURN = '2026-11-22T00:00:00.000Z';

let repos: Repositories;
let healthyId: string;
let injuredId: string;
let otherId: string;
let extraId: string;

interface CallerOptions {
  groups: string;
  sub: string;
}
const STAFF: CallerOptions = { groups: 'Moderator', sub: 'gm-sub' };
const WRESTLER = (sub: string): CallerOptions => ({ groups: 'Wrestler', sub });

function event(caller: CallerOptions, overrides: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'POST', isBase64Encoded: false,
    path: '/', pathParameters: null, queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '',
    requestContext: {
      authorizer: { groups: caller.groups, username: caller.sub, principalId: caller.sub },
    } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

type Result = { statusCode: number; body: string };
const call = async (
  handler: (e: APIGatewayProxyEvent, c: Context, cb: Callback) => unknown,
  e: APIGatewayProxyEvent,
): Promise<Result> => (await handler(e, ctx, cb)) as APIGatewayProxyResult;
const json = (result: Result): Record<string, unknown> => JSON.parse(result.body) as Record<string, unknown>;

async function addPlayer(name: string, userId: string): Promise<string> {
  const player = await repos.roster.players.create({ name, currentWrestler: name });
  await repos.roster.players.update(player.playerId, { userId });
  return player.playerId;
}

async function injure(playerId: string, returnsAt: string = RETURNS_AT): Promise<void> {
  await repos.runInTransaction(async (tx) => {
    tx.updatePlayerCondition(playerId, {
      currentInjury: {
        injuryId: `inj-${playerId}`, startedAt: '2026-11-20T00:00:00.000Z', returnsAt,
        severity: 'moderate', weeks: 2, source: 'match',
      },
    });
  });
}

function expectInjured(result: Result, playerId: string): void {
  expect(result.statusCode).toBe(409);
  expect(json(result)).toMatchObject({ code: 'PLAYER_INJURED', playerId, returnsAt: RETURNS_AT });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  await repos.user.siteConfig.updateFeatures({ injuries: true });
  healthyId = await addPlayer('Healthy', 'user-healthy');
  injuredId = await addPlayer('Hurt', 'user-hurt');
  otherId = await addPlayer('Other', 'user-other');
  extraId = await addPlayer('Extra', 'user-extra');
  await injure(injuredId);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetRepositoriesForTesting();
});

describe('injuryRefusal', () => {
  it('names the player and their return date', () => {
    const refusal = injuryRefusal(
      { playerId: 'p1', name: 'Hurt', currentInjury: { injuryId: 'i', startedAt: 'x', returnsAt: RETURNS_AT, severity: 'minor', weeks: 1, source: 'match' } },
      NOW,
    );
    expect(refusal?.statusCode).toBe(409);
    expect(JSON.parse(refusal?.body ?? '{}')).toEqual({
      code: 'PLAYER_INJURED', message: 'Hurt is injured until 2026-12-06', playerId: 'p1', returnsAt: RETURNS_AT,
    });
  });

  it('is null once returnsAt has passed', () => {
    const refusal = injuryRefusal(
      { playerId: 'p1', name: 'Hurt', currentInjury: { injuryId: 'i', startedAt: 'x', returnsAt: PAST_RETURN, severity: 'minor', weeks: 1, source: 'match' } },
      NOW,
    );
    expect(refusal).toBeNull();
  });
});

describe('POST /matches (scheduleMatch)', () => {
  const book = (caller: CallerOptions, body: Record<string, unknown>) => call(scheduleMatch, event(caller, {
    body: JSON.stringify({ matchFormat: 'singles', isChampionship: false, ...body }),
  }));

  it('refuses an injured player with 409 PLAYER_INJURED', async () => {
    const result = await book(STAFF, { participants: [healthyId, injuredId] });
    expectInjured(result, injuredId);
    expect(json(result).message).toBe('Hurt is injured until 2026-12-06');
    expect(await repos.competition.matches.list()).toHaveLength(0);
  });

  it('refuses an injured player in an open slot booking too', async () => {
    const result = await book(STAFF, {
      slotsRequired: 2, slots: [{ position: 1, playerId: injuredId }, { position: 2 }],
    });
    expectInjured(result, injuredId);
  });

  it('books with a warning and records the override when staff send allowInjured', async () => {
    const result = await book(STAFF, { participants: [healthyId, injuredId], allowInjured: true });
    expect(result.statusCode).toBe(201);
    const body = json(result);
    expect(body.injuryWarnings).toEqual([expect.objectContaining({
      code: 'PLAYER_INJURED', playerId: injuredId, name: 'Hurt', returnsAt: RETURNS_AT,
    })]);
    const stored = await repos.competition.matches.findById(body.matchId as string) as Match;
    expect(stored.injuryOverrides).toEqual([{ playerId: injuredId, by: 'gm-sub', at: NOW.toISOString() }]);
    expect(stored).not.toHaveProperty('injuryWarnings');
    expect(stored).not.toHaveProperty('allowInjured');
  });

  it('ignores allowInjured from a Wrestler', async () => {
    const result = await book(WRESTLER('user-healthy'), { participants: [healthyId, injuredId], allowInjured: true });
    expectInjured(result, injuredId);
  });

  it('books a player whose returnsAt has passed, before the weekly job clears it', async () => {
    await injure(injuredId, PAST_RETURN);
    const result = await book(STAFF, { participants: [healthyId, injuredId] });
    expect(result.statusCode).toBe(201);
    expect(json(result)).not.toHaveProperty('injuryWarnings');
  });

  it('does not gate while the injuries feature is off', async () => {
    await repos.user.siteConfig.updateFeatures({ injuries: false });
    const result = await book(STAFF, { participants: [healthyId, injuredId] });
    expect(result.statusCode).toBe(201);
    expect(json(result)).not.toHaveProperty('injuryWarnings');
  });
});

describe('PUT /matches/{matchId} (updateMatch)', () => {
  async function seedMatch(participants: string[]): Promise<string> {
    const match = await repos.competition.matches.create({
      matchId: 'm-edit', date: '2026-11-30T00:00:00.000Z', matchFormat: 'singles',
      participants, isChampionship: false, status: 'scheduled', createdAt: NOW.toISOString(),
    });
    return (match as { matchId: string }).matchId;
  }
  const edit = (caller: CallerOptions, matchId: string, body: Record<string, unknown>) => call(updateMatch, event(caller, {
    httpMethod: 'PUT', pathParameters: { matchId }, body: JSON.stringify(body),
  }));

  it('refuses adding an injured player', async () => {
    const matchId = await seedMatch([healthyId, otherId]);
    expectInjured(await edit(STAFF, matchId, { participants: [healthyId, injuredId] }), injuredId);
  });

  it('lets an injured player already on the match stay', async () => {
    const matchId = await seedMatch([healthyId, injuredId]);
    const result = await edit(STAFF, matchId, { participants: [healthyId, injuredId, otherId] });
    expect(result.statusCode).toBe(200);
    expect(json(result)).not.toHaveProperty('injuryWarnings');
  });

  it('records the override and returns the warning with allowInjured', async () => {
    const matchId = await seedMatch([healthyId, otherId]);
    const result = await edit(STAFF, matchId, { participants: [healthyId, injuredId], allowInjured: true });
    expect(result.statusCode).toBe(200);
    expect(json(result).injuryWarnings).toEqual([expect.objectContaining({ playerId: injuredId })]);
    const stored = await repos.competition.matches.findById(matchId) as Match;
    expect(stored.injuryOverrides).toEqual([{ playerId: injuredId, by: 'gm-sub', at: NOW.toISOString() }]);
  });

  it('ignores allowInjured from a Wrestler', async () => {
    const matchId = await seedMatch([healthyId, otherId]);
    const result = await edit(WRESTLER('user-healthy'), matchId, { participants: [healthyId, injuredId], allowInjured: true });
    expectInjured(result, injuredId);
  });

  it('allows a player whose returnsAt has passed', async () => {
    await injure(injuredId, PAST_RETURN);
    const matchId = await seedMatch([healthyId, otherId]);
    expect((await edit(STAFF, matchId, { participants: [healthyId, injuredId] })).statusCode).toBe(200);
  });
});

async function seedSlotMatch(): Promise<string> {
  await repos.competition.matches.create({
    matchId: 'm-slots', date: '2026-11-30T00:00:00.000Z', matchFormat: 'singles',
    participants: [healthyId], isChampionship: false, status: 'open-signups', createdAt: NOW.toISOString(),
    slots: [{ slotId: 's1', position: 1, playerId: healthyId }, { slotId: 's2', position: 2 }],
    slotsRequired: 2,
  });
  return 'm-slots';
}

describe('PUT /matches/{matchId}/slots/{slotId} (adminUpdateSlot)', () => {
  const assign = (caller: CallerOptions, body: Record<string, unknown>) => call(adminUpdateSlot, event(caller, {
    httpMethod: 'PUT', pathParameters: { matchId: 'm-slots', slotId: 's2' }, body: JSON.stringify(body),
  }));

  it('refuses assigning an injured player', async () => {
    await seedSlotMatch();
    expectInjured(await assign(STAFF, { playerId: injuredId }), injuredId);
  });

  it('assigns with a warning and records the override with allowInjured', async () => {
    await seedSlotMatch();
    const result = await assign(STAFF, { playerId: injuredId, allowInjured: true });
    expect(result.statusCode).toBe(200);
    expect(json(result).injuryWarnings).toEqual([expect.objectContaining({ playerId: injuredId })]);
    const stored = await repos.competition.matches.findById('m-slots') as Match;
    expect(stored.injuryOverrides).toEqual([{ playerId: injuredId, by: 'gm-sub', at: NOW.toISOString() }]);
    expect(stored.participants).toEqual([healthyId, injuredId]);
  });

  it('allows a player whose returnsAt has passed', async () => {
    await injure(injuredId, PAST_RETURN);
    await seedSlotMatch();
    expect((await assign(STAFF, { playerId: injuredId })).statusCode).toBe(200);
  });
});

describe('POST /matches/{matchId}/slots/{slotId}/claim (claimSlot)', () => {
  const claim = (sub: string, body: Record<string, unknown> = {}) => call(claimSlot, event(WRESTLER(sub), {
    pathParameters: { matchId: 'm-slots', slotId: 's2' }, body: JSON.stringify(body),
  }));

  it('refuses an injured caller, even with allowInjured', async () => {
    await seedSlotMatch();
    const result = await claim('user-hurt', { allowInjured: true });
    expectInjured(result, injuredId);
    expect(json(result).message).toBe('You are injured until 2026-12-06');
    const stored = await repos.competition.matches.findById('m-slots') as Match;
    expect(stored.slots?.[1].playerId).toBeUndefined();
  });

  it('lets a player whose returnsAt has passed claim', async () => {
    await injure(injuredId, PAST_RETURN);
    await seedSlotMatch();
    expect((await claim('user-hurt')).statusCode).toBe(200);
  });
});

describe('challenges', () => {
  const issue = (sub: string, challengedId: string, extra: Record<string, unknown> = {}) => call(createChallenge, event(WRESTLER(sub), {
    body: JSON.stringify({ challengedId, matchType: 'Singles', ...extra }),
  }));

  it('refuses challenging an injured player, even with allowInjured', async () => {
    expectInjured(await issue('user-healthy', injuredId, { allowInjured: true }), injuredId);
  });

  it('refuses an injured challenger', async () => {
    const result = await issue('user-hurt', healthyId);
    expectInjured(result, injuredId);
    expect(json(result).message).toBe('You are injured until 2026-12-06');
  });

  it('allows a player whose returnsAt has passed', async () => {
    await injure(injuredId, PAST_RETURN);
    expect((await issue('user-healthy', injuredId)).statusCode).toBe(201);
  });

  it('refuses accepting while the other side is injured', async () => {
    const issued = await issue('user-other', extraId);
    expect(issued.statusCode).toBe(201);
    await injure(otherId);
    const result = await call(respondToChallenge, event(WRESTLER('user-extra'), {
      pathParameters: { challengeId: json(issued).challengeId as string },
      body: JSON.stringify({ action: 'accept', allowInjured: true }),
    }));
    expectInjured(result, otherId);
  });

  it('still lets an injured player decline', async () => {
    const issued = await issue('user-other', extraId);
    await injure(extraId);
    const result = await call(respondToChallenge, event(WRESTLER('user-extra'), {
      pathParameters: { challengeId: json(issued).challengeId as string },
      body: JSON.stringify({ action: 'decline' }),
    }));
    expect(result.statusCode).toBe(200);
  });
});

describe('POST /tournaments (createTournament)', () => {
  const create = (caller: CallerOptions, extra: Record<string, unknown> = {}) => call(createTournament, event(caller, {
    body: JSON.stringify({ name: 'Cup', type: 'round-robin', participants: [healthyId, injuredId, otherId], ...extra }),
  }));

  it('refuses an injured entrant', async () => {
    expectInjured(await create(STAFF), injuredId);
  });

  it('enters them with a warning and records the override with allowInjured', async () => {
    const result = await create(STAFF, { allowInjured: true });
    expect(result.statusCode).toBe(201);
    const body = json(result);
    expect(body.injuryWarnings).toEqual([expect.objectContaining({ playerId: injuredId })]);
    const stored = await repos.competition.tournaments.findById(body.tournamentId as string);
    expect(stored?.injuryOverrides).toEqual([{ playerId: injuredId, by: 'gm-sub', at: NOW.toISOString() }]);
  });

  it('ignores allowInjured from a Wrestler', async () => {
    expectInjured(await create(WRESTLER('user-healthy'), { allowInjured: true }), injuredId);
  });

  it('allows an entrant whose returnsAt has passed', async () => {
    await injure(injuredId, PAST_RETURN);
    expect((await create(STAFF)).statusCode).toBe(201);
  });
});
