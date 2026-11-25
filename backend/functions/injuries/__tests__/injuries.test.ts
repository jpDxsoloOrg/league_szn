import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const { createNotification } = vi.hoisted(() => ({ createNotification: vi.fn() }));

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});
vi.mock('../../../lib/authenticate', async () => {
  const { fakeAuthenticate } = await import('../../__tests__/visibilityTestHelpers');
  return { authenticate: fakeAuthenticate };
});
vi.mock('../../../lib/notifications', () => ({ createNotification }));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { toCurrentInjury, type Injury, type PublicInjury } from '../../../lib/repositories/injuries';
import type { FeatureFlags } from '../../../lib/repositories/SiteConfigRepository';
import { bearer, call, makeEvent } from '../../__tests__/visibilityTestHelpers';
import { handler as injuriesRouter } from '../handler';
import type { InjuryBoardEntry } from '../listInjuries';
import type { AdjustStaminaResult } from '../adjustStamina';
import { returnDate } from '../../../lib/policies/fatigue';
import { DEFAULT_INJURY_TUNABLES, toInjuryTunablesInput } from '../../../lib/policies/fatigueDefaults';
import { INJURIES_OFF_MESSAGE } from '../shared';

type Auth = Pick<APIGatewayProxyEvent, 'headers'>;
type Body<T> = T & { message?: string };

const ADMIN = bearer('admin-sub', 'Admin');
const MODERATOR = bearer('mod-sub', 'Moderator');
const WRESTLER = bearer('player-sub', 'Wrestler');
const ANONYMOUS: Auth = { headers: {} };
const BAD_TOKEN: Auth = { headers: { Authorization: 'Bearer invalid' } };

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number): string => new Date(Date.now() + days * DAY_MS).toISOString();

const injuriesFlag = (on: boolean): Partial<FeatureFlags> => ({ injuries: on });
/** INJ-02's return date in the default league time zone, as stored. */
const expectedReturnsAt = (startedAt: string, weeks: number): string =>
  returnDate(startedAt, weeks, DEFAULT_INJURY_TUNABLES.timezone).toISOString();

let repos: Repositories;
let playerId: string;

function request<T>(
  method: string,
  resource: string,
  options: { auth?: Auth; body?: Record<string, unknown>; query?: Record<string, string> } = {},
) {
  return call<Body<T>>(injuriesRouter, makeEvent({
    ...(options.auth ?? ADMIN),
    httpMethod: method,
    resource,
    path: resource.replace('{playerId}', playerId),
    pathParameters: resource.includes('{playerId}') ? { playerId } : null,
    queryStringParameters: options.query ?? null,
    body: options.body ? JSON.stringify(options.body) : null,
  }));
}

/** An open match injury, stored on the row and the player. */
async function seedInjury(overrides: Partial<Injury> = {}): Promise<Injury> {
  const injury: Injury = {
    playerId,
    startedAt: inDays(-3),
    injuryId: 'inj-match',
    source: 'match',
    severity: 'moderate',
    weeks: 2,
    returnsAt: inDays(10),
    matchId: 'match-1',
    changes: [],
    ...overrides,
  };
  await repos.runInTransaction(async (tx) => {
    tx.putInjury(injury);
    tx.updatePlayerCondition(playerId, { currentInjury: toCurrentInjury(injury) });
  });
  return injury;
}

const storedPlayer = async () => (await repos.roster.players.findById(playerId))!;

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  await repos.user.siteConfig.updateFeatures(injuriesFlag(true));
  playerId = (await repos.roster.players.create({ name: 'Rock', currentWrestler: 'The Rock' })).playerId;
  await repos.roster.players.update(playerId, { userId: 'player-sub' });
  createNotification.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.restoreAllMocks();
});

describe('INJ-08 roles', () => {
  const staffRoutes: Array<[string, string, Record<string, unknown> | undefined]> = [
    ['GET', '/injuries', undefined],
    ['POST', '/players/{playerId}/injuries', { weeks: 2, severity: 'minor' }],
    ['POST', '/players/{playerId}/injuries/heal', {}],
    ['PATCH', '/players/{playerId}/injuries/current', { weeks: 3 }],
    ['PATCH', '/players/{playerId}/stamina', { stamina: 50 }],
  ];

  it.each(staffRoutes)('%s %s refuses a wrestler and an unverified caller', async (method, resource, body) => {
    expect((await request(method, resource, { auth: WRESTLER, body })).statusCode).toBe(403);
    expect((await request(method, resource, { auth: BAD_TOKEN, body })).statusCode).toBe(401);
  });

  it('lets a Moderator act as well as an Admin', async () => {
    const { statusCode } = await request('PATCH', '/players/{playerId}/stamina', {
      auth: MODERATOR,
      body: { stamina: 40 },
    });
    expect(statusCode).toBe(200);
  });

  it('answers 403 on staff routes while the injuries feature is off', async () => {
    await repos.user.siteConfig.updateFeatures(injuriesFlag(false));
    const { statusCode, body } = await request('PATCH', '/players/{playerId}/stamina', { body: { stamina: 40 } });
    expect(statusCode).toBe(403);
    expect(body.message).toBe(INJURIES_OFF_MESSAGE);
    expect((await request('GET', '/injuries')).statusCode).toBe(403);
  });
});

describe('GET /injuries', () => {
  it('lists open injuries with the player, soonest return first, and leaves out ended ones', async () => {
    await seedInjury();
    const otherId = (await repos.roster.players.create({ name: 'Cena', currentWrestler: 'John Cena' })).playerId;
    await repos.runInTransaction(async (tx) => {
      tx.putInjury({
        playerId: otherId,
        startedAt: inDays(-20),
        injuryId: 'old',
        source: 'match',
        severity: 'minor',
        weeks: 1,
        returnsAt: inDays(-10),
        endedAt: inDays(-10),
        endedReason: 'recovered',
        changes: [],
      });
    });

    const { statusCode, body } = await request<InjuryBoardEntry[]>('GET', '/injuries', { query: { active: 'true' } });
    expect(statusCode).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].injury.injuryId).toBe('inj-match');
    expect(body[0].player).toMatchObject({ playerId, name: 'Rock', currentWrestler: 'The Rock' });
    expect(body[0].pastReturnDate).toBe(false);
  });

  // INJ-11
  it('adds the scheduled matches before the return date and the titles held', async () => {
    await seedInjury();
    await repos.competition.matches.create({
      matchId: 'before-return', date: inDays(3), status: 'scheduled', matchFormat: 'singles', participants: [playerId, 'x'],
    });
    await repos.competition.matches.create({
      matchId: 'after-return', date: inDays(30), status: 'scheduled', matchFormat: 'singles', participants: [playerId, 'x'],
    });
    await repos.competition.championships.create({ name: 'World', type: 'singles', currentChampion: playerId });

    const { body } = await request<InjuryBoardEntry[]>('GET', '/injuries', { query: { active: 'true' } });
    expect(body[0].impact).toEqual({ scheduledMatchIds: ['before-return'], titles: ['World'] });
  });

  it('rejects active=false', async () => {
    expect((await request('GET', '/injuries', { query: { active: 'false' } })).statusCode).toBe(400);
  });
});

describe('GET /players/{playerId}/injuries', () => {
  it('shows the public history without notes, source or the change log', async () => {
    await seedInjury({ note: 'Kayfabe: hurt backstage' });
    const { statusCode, body } = await request<PublicInjury[]>('GET', '/players/{playerId}/injuries', { auth: ANONYMOUS });
    expect(statusCode).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]).not.toHaveProperty('note');
    expect(body[0]).not.toHaveProperty('source');
    expect(body[0]).not.toHaveProperty('changes');
    expect(body[0]).toMatchObject({ injuryId: 'inj-match', severity: 'moderate', weeks: 2 });
  });

  it('gives staff the full rows', async () => {
    await seedInjury({ note: 'GM note' });
    const { body } = await request<Injury[]>('GET', '/players/{playerId}/injuries', { auth: MODERATOR });
    expect(body[0]).toMatchObject({ note: 'GM note', source: 'match', changes: [] });
  });

  it('returns an empty list while the feature is off', async () => {
    await seedInjury();
    await repos.user.siteConfig.updateFeatures(injuriesFlag(false));
    const { statusCode, body } = await request<PublicInjury[]>('GET', '/players/{playerId}/injuries', { auth: ANONYMOUS });
    expect(statusCode).toBe(200);
    expect(body).toEqual([]);
  });
});

describe('POST /players/{playerId}/injuries/heal', () => {
  it('ends the injury now as healedByGm, logs who and why, clears the player and notifies them', async () => {
    const injury = await seedInjury();
    const { statusCode, body } = await request<Injury>('POST', '/players/{playerId}/injuries/heal', {
      auth: MODERATOR,
      body: { note: 'Storyline return' },
    });

    expect(statusCode).toBe(200);
    expect(body.endedReason).toBe('healedByGm');
    expect(body.endedAt).toBeDefined();
    expect(body.changes).toEqual([
      expect.objectContaining({
        kind: 'healed',
        by: 'mod-sub',
        note: 'Storyline return',
        returnsAtBefore: injury.returnsAt,
        returnsAtAfter: body.endedAt,
      }),
    ]);
    expect((await storedPlayer()).currentInjury).toBeUndefined();
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'player-sub',
      type: 'injury_healed',
      sourceType: 'injury',
    }));
  });

  it('accepts an empty body', async () => {
    await seedInjury();
    const result = await call(injuriesRouter, makeEvent({
      ...ADMIN,
      httpMethod: 'POST',
      resource: '/players/{playerId}/injuries/heal',
      path: `/players/${playerId}/injuries/heal`,
      pathParameters: { playerId },
    }));
    expect(result.statusCode).toBe(200);
  });

  it('answers 409 when the player is not injured', async () => {
    const { statusCode } = await request('POST', '/players/{playerId}/injuries/heal', { body: {} });
    expect(statusCode).toBe(409);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('answers 409 when the return date has already passed', async () => {
    await seedInjury({ startedAt: inDays(-20), returnsAt: inDays(-1) });
    expect((await request('POST', '/players/{playerId}/injuries/heal', { body: {} })).statusCode).toBe(409);
  });

  it('answers 404 for an unknown player', async () => {
    const result = await call(injuriesRouter, makeEvent({
      ...ADMIN,
      httpMethod: 'POST',
      resource: '/players/{playerId}/injuries/heal',
      path: '/players/nobody/injuries/heal',
      pathParameters: { playerId: 'nobody' },
      body: '{}',
    }));
    expect(result.statusCode).toBe(404);
  });
});

describe('PATCH /players/{playerId}/injuries/current', () => {
  it('extends by weeks, snapping to the league week, and appends an extended change', async () => {
    const injury = await seedInjury();
    const { statusCode, body } = await request<Injury>('PATCH', '/players/{playerId}/injuries/current', {
      body: { weeks: 4, note: 'Aggravated it' },
    });

    expect(statusCode).toBe(200);
    expect(body.weeks).toBe(4);
    expect(body.returnsAt).toBe(expectedReturnsAt(injury.startedAt, 4));
    expect(body.endedAt).toBeUndefined();
    expect(body.changes).toEqual([
      expect.objectContaining({
        kind: 'extended',
        by: 'admin-sub',
        note: 'Aggravated it',
        weeksBefore: 2,
        weeksAfter: 4,
        returnsAtBefore: injury.returnsAt,
        returnsAtAfter: body.returnsAt,
      }),
    ]);
    const player = await storedPlayer();
    expect(player.currentInjury).toMatchObject({ injuryId: injury.injuryId, weeks: 4, returnsAt: body.returnsAt });
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'injury_updated' }));
  });

  it('shortens to an exact returnsAt and keeps the audit trail in order', async () => {
    await seedInjury({ returnsAt: inDays(20), weeks: 4 });
    const shorter = inDays(5);
    const first = await request<Injury>('PATCH', '/players/{playerId}/injuries/current', { body: { returnsAt: shorter } });
    expect(first.statusCode).toBe(200);
    expect(first.body.returnsAt).toBe(shorter);
    expect(first.body.changes[0].kind).toBe('shortened');

    const second = await request<Injury>('PATCH', '/players/{playerId}/injuries/current', {
      auth: MODERATOR,
      body: { returnsAt: inDays(12) },
    });
    expect(second.body.changes.map((change) => [change.kind, change.by])).toEqual([
      ['shortened', 'admin-sub'],
      ['extended', 'mod-sub'],
    ]);
  });

  it('rejects both or neither of weeks and returnsAt, and a date in the past', async () => {
    await seedInjury();
    const patch = (body: Record<string, unknown>) =>
      request('PATCH', '/players/{playerId}/injuries/current', { body });
    expect((await patch({})).statusCode).toBe(400);
    expect((await patch({ weeks: 3, returnsAt: inDays(30) })).statusCode).toBe(400);
    expect((await patch({ weeks: 0 })).statusCode).toBe(400);
    expect((await patch({ returnsAt: 'soon' })).statusCode).toBe(400);
    expect((await patch({ returnsAt: inDays(-1) })).statusCode).toBe(400);
  });

  it('answers 409 when the player is not injured', async () => {
    const { statusCode } = await request('PATCH', '/players/{playerId}/injuries/current', { body: { weeks: 3 } });
    expect(statusCode).toBe(409);
  });
});

describe('POST /players/{playerId}/injuries', () => {
  it('puts on a storyline injury with the GM as author', async () => {
    const { statusCode, body } = await request<Injury>('POST', '/players/{playerId}/injuries', {
      body: { weeks: 3, severity: 'major', note: 'Attacked in the parking lot' },
    });

    expect(statusCode).toBe(201);
    expect(body).toMatchObject({
      playerId,
      source: 'storyline',
      severity: 'major',
      weeks: 3,
      note: 'Attacked in the parking lot',
      createdBy: 'admin-sub',
      changes: [],
    });
    expect(body.returnsAt).toBe(expectedReturnsAt(body.startedAt, 3));
    expect((await storedPlayer()).currentInjury).toEqual(toCurrentInjury(body));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'injury_added', userId: 'player-sub' }));
  });

  it('ends on the week boundary of the league time zone tunable', async () => {
    const timezone = 'Asia/Tokyo';
    await repos.user.siteConfig.saveInjuryTunables(
      { ...toInjuryTunablesInput(DEFAULT_INJURY_TUNABLES), timezone },
      'admin',
    );
    const { statusCode, body } = await request<Injury>('POST', '/players/{playerId}/injuries', {
      body: { weeks: 2, severity: 'minor' },
    });
    expect(statusCode).toBe(201);
    expect(body.returnsAt).toBe(returnDate(body.startedAt, 2, timezone).toISOString());
    expect(body.returnsAt).not.toBe(expectedReturnsAt(body.startedAt, 2));
  });

  it('answers 409 when the player is already injured', async () => {
    await seedInjury();
    const { statusCode } = await request('POST', '/players/{playerId}/injuries', { body: { weeks: 2, severity: 'minor' } });
    expect(statusCode).toBe(409);
  });

  it('closes a lapsed injury the weekly recovery has not ended yet', async () => {
    const lapsed = await seedInjury({ startedAt: inDays(-20), returnsAt: inDays(-1) });
    const { statusCode, body } = await request<Injury>('POST', '/players/{playerId}/injuries', {
      body: { weeks: 1, severity: 'minor' },
    });
    expect(statusCode).toBe(201);
    expect(await repos.injuries.get(playerId, lapsed.startedAt)).toMatchObject({
      endedAt: lapsed.returnsAt,
      endedReason: 'recovered',
    });
    expect((await storedPlayer()).currentInjury?.injuryId).toBe(body.injuryId);
  });

  it('validates weeks and severity', async () => {
    const post = (body: Record<string, unknown>) => request('POST', '/players/{playerId}/injuries', { body });
    expect((await post({ weeks: 2, severity: 'broken' })).statusCode).toBe(400);
    expect((await post({ weeks: 1.5, severity: 'minor' })).statusCode).toBe(400);
    expect((await post({ weeks: 53, severity: 'minor' })).statusCode).toBe(400);
    expect((await post({ severity: 'minor' })).statusCode).toBe(400);
  });
});

describe('PATCH /players/{playerId}/stamina', () => {
  it('sets stamina, reports the value before, logs the audit entry and notifies the player', async () => {
    const { statusCode, body } = await request<AdjustStaminaResult>('PATCH', '/players/{playerId}/stamina', {
      body: { stamina: 35, note: 'Long tour' },
    });
    expect(statusCode).toBe(200);
    expect(body).toEqual({ playerId, staminaBefore: null, stamina: 35 });
    expect((await storedPlayer()).stamina).toBe(35);
    const audit = JSON.parse(vi.mocked(console.log).mock.calls[0][0] as string);
    expect(audit).toMatchObject({ audit: 'staminaAdjusted', playerId, by: 'admin-sub', staminaAfter: 35, note: 'Long tour' });
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'stamina_adjusted' }));

    const again = await request<AdjustStaminaResult>('PATCH', '/players/{playerId}/stamina', { body: { stamina: 80 } });
    expect(again.body.staminaBefore).toBe(35);
  });

  it('rejects values outside 0 to 100 and fractions', async () => {
    for (const stamina of [-1, 101, 12.5, '50']) {
      expect((await request('PATCH', '/players/{playerId}/stamina', { body: { stamina } })).statusCode).toBe(400);
    }
  });

  it('caps stamina at the maxStamina tunable', async () => {
    await repos.user.siteConfig.saveInjuryTunables(
      { ...toInjuryTunablesInput(DEFAULT_INJURY_TUNABLES), maxStamina: 120 },
      'admin',
    );
    expect((await request('PATCH', '/players/{playerId}/stamina', { body: { stamina: 120 } })).statusCode).toBe(200);
    const tooHigh = await request('PATCH', '/players/{playerId}/stamina', { body: { stamina: 121 } });
    expect(tooHigh.statusCode).toBe(400);
    expect(tooHigh.body.message).toContain('0 to 120');
  });

  it('skips the notification for a player with no linked account', async () => {
    const otherId = (await repos.roster.players.create({ name: 'Cena', currentWrestler: 'John Cena' })).playerId;
    const result = await call(injuriesRouter, makeEvent({
      ...ADMIN,
      httpMethod: 'PATCH',
      resource: '/players/{playerId}/stamina',
      path: `/players/${otherId}/stamina`,
      pathParameters: { playerId: otherId },
      body: JSON.stringify({ stamina: 10 }),
    }));
    expect(result.statusCode).toBe(200);
    expect(createNotification).not.toHaveBeenCalled();
  });
});
