import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  DEFAULT_DIVISION_LADDER_RULES,
  type Repositories,
} from '../../../lib/repositories';
import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import type { Division } from '../../../lib/repositories/types';

import { handler as getDivisionLadder } from '../getDivisionLadder';
import { handler as updateDivisionLadder } from '../updateDivisionLadder';
import { handler as getDivisions } from '../../divisions/getDivisions';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

function withAuth(event: APIGatewayProxyEvent, groups: string): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'testuser', email: 'test@test.com', principalId: 'user-sub-1' },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

function adminGet(): APIGatewayProxyEvent {
  return withAuth(makeEvent({ httpMethod: 'GET' }), 'Admin');
}

function adminPut(body: unknown): APIGatewayProxyEvent {
  return withAuth(makeEvent({ httpMethod: 'PUT', body: JSON.stringify(body) }), 'Admin');
}

let repos: Repositories;

beforeEach(() => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

afterEach(() => {
  resetRepositoriesForTesting();
});

async function seedDivisions(): Promise<Division[]> {
  const jobber = await repos.leagueOps.divisions.create({ name: 'Jobber', rank: 0 });
  const midcard = await repos.leagueOps.divisions.create({ name: 'Midcard', rank: 1 });
  const mainEvent = await repos.leagueOps.divisions.create({ name: 'Main Event', rank: 2 });
  return [jobber, midcard, mainEvent];
}

// ─── GET ─────────────────────────────────────────────────────────────

describe('getDivisionLadder', () => {
  it('returns default rules, an empty ladder and no movements when nothing is configured', async () => {
    const result = await getDivisionLadder(adminGet(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.rules).toEqual(DEFAULT_DIVISION_LADDER_RULES);
    expect(body.divisions).toEqual([]);
    expect(body.recentMovements).toEqual([]);
  });

  it('returns divisions sorted by rank with unranked ones last', async () => {
    const [jobber, midcard, mainEvent] = await seedDivisions();
    const unranked = await repos.leagueOps.divisions.create({ name: 'Unranked' });

    const result = await getDivisionLadder(adminGet(), ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body.divisions.map((division: Division) => division.divisionId)).toEqual([
      jobber.divisionId,
      midcard.divisionId,
      mainEvent.divisionId,
      unranked.divisionId,
    ]);
  });

  it('includes the most recent movements', async () => {
    const [jobber, midcard] = await seedDivisions();
    await repos.leagueOps.divisionMovements.create({
      playerId: 'p1',
      fromDivisionId: jobber.divisionId,
      toDivisionId: midcard.divisionId,
      direction: 'promoted',
      trigger: 'streak',
      streakCount: 5,
    });

    const result = await getDivisionLadder(adminGet(), ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body.recentMovements).toHaveLength(1);
    expect(body.recentMovements[0].playerId).toBe('p1');
  });

  it('rejects non-admins with 403', async () => {
    const moderator = withAuth(makeEvent(), 'Moderator');
    const result = await getDivisionLadder(moderator, ctx, cb);
    expect(result!.statusCode).toBe(403);

    const anonymous = await getDivisionLadder(makeEvent(), ctx, cb);
    expect(anonymous!.statusCode).toBe(403);
  });
});

// ─── PUT rules ───────────────────────────────────────────────────────

describe('updateDivisionLadder rules', () => {
  it('rejects a streak threshold below the minimum', async () => {
    const result = await updateDivisionLadder(adminPut({ rules: { promoteWinStreak: 1 } }), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toMatch(/between 2 and 20/);
    expect(await repos.user.siteConfig.getDivisionLadderRules()).toEqual(DEFAULT_DIVISION_LADDER_RULES);
  });

  it('rejects a streak threshold above the maximum', async () => {
    const result = await updateDivisionLadder(adminPut({ rules: { demoteLossStreak: 21 } }), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(await repos.user.siteConfig.getDivisionLadderRules()).toEqual(DEFAULT_DIVISION_LADDER_RULES);
  });

  it('rejects non-integer and non-boolean values', async () => {
    const fractional = await updateDivisionLadder(adminPut({ rules: { promoteWinStreak: 5.5 } }), ctx, cb);
    expect(fractional!.statusCode).toBe(400);

    const stringy = await updateDivisionLadder(adminPut({ rules: { enabled: 'yes' } }), ctx, cb);
    expect(stringy!.statusCode).toBe(400);
  });

  it('rejects unknown rule keys', async () => {
    const result = await updateDivisionLadder(adminPut({ rules: { bogus: 3 } }), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toMatch(/Unknown rule/);
  });

  it('rejects an empty body with neither rules nor order', async () => {
    const result = await updateDivisionLadder(adminPut({}), ctx, cb);
    expect(result!.statusCode).toBe(400);
  });

  it('accepts an in-range threshold and persists it', async () => {
    const result = await updateDivisionLadder(
      adminPut({ rules: { promoteWinStreak: 5, demoteLossStreak: 3, enabled: false } }),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.rules).toEqual({ enabled: false, promoteWinStreak: 5, demoteLossStreak: 3 });
    expect(await repos.user.siteConfig.getDivisionLadderRules()).toEqual({
      enabled: false,
      promoteWinStreak: 5,
      demoteLossStreak: 3,
    });
  });

  it('merges a partial rules patch with existing values', async () => {
    await repos.user.siteConfig.updateDivisionLadderRules({ demoteLossStreak: 4 });

    const result = await updateDivisionLadder(adminPut({ rules: { promoteWinStreak: 7 } }), ctx, cb);

    expect(JSON.parse(result!.body).rules).toEqual({ enabled: true, promoteWinStreak: 7, demoteLossStreak: 4 });
  });
});

// ─── PUT order ───────────────────────────────────────────────────────

describe('updateDivisionLadder order', () => {
  it('re-ranks divisions to match the order and returns them sorted', async () => {
    const [jobber, midcard, mainEvent] = await seedDivisions();
    const newOrder = [mainEvent.divisionId, jobber.divisionId, midcard.divisionId];

    const result = await updateDivisionLadder(adminPut({ order: newOrder }), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.divisions.map((division: Division) => division.divisionId)).toEqual(newOrder);
    expect(body.divisions.map((division: Division) => division.rank)).toEqual([0, 1, 2]);

    const stored = await repos.leagueOps.divisions.findById(mainEvent.divisionId);
    expect(stored?.rank).toBe(0);

    // Public list reflects the new ladder too.
    const publicList = await getDivisions(makeEvent(), ctx, cb);
    expect(JSON.parse(publicList!.body).map((division: Division) => division.divisionId)).toEqual(newOrder);
  });

  it('assigns ranks to previously unranked divisions', async () => {
    const first = await repos.leagueOps.divisions.create({ name: 'A' });
    const second = await repos.leagueOps.divisions.create({ name: 'B' });

    const result = await updateDivisionLadder(
      adminPut({ order: [second.divisionId, first.divisionId] }),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(200);
    expect((await repos.leagueOps.divisions.findById(second.divisionId))?.rank).toBe(0);
    expect((await repos.leagueOps.divisions.findById(first.divisionId))?.rank).toBe(1);
  });

  it('leaves divisions missing from a partial order untouched', async () => {
    const [jobber, midcard, mainEvent] = await seedDivisions();

    const result = await updateDivisionLadder(
      adminPut({ order: [midcard.divisionId, jobber.divisionId] }),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(200);
    expect((await repos.leagueOps.divisions.findById(mainEvent.divisionId))?.rank).toBe(2);
  });

  it('rejects an unknown division id with 400 and changes nothing', async () => {
    const [jobber, midcard] = await seedDivisions();

    const result = await updateDivisionLadder(
      adminPut({ order: [midcard.divisionId, 'nope', jobber.divisionId] }),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toMatch(/Unknown division/);
    expect((await repos.leagueOps.divisions.findById(jobber.divisionId))?.rank).toBe(0);
    expect((await repos.leagueOps.divisions.findById(midcard.divisionId))?.rank).toBe(1);
  });

  it('rejects duplicate ids and non-array order', async () => {
    const [jobber] = await seedDivisions();

    const duplicate = await updateDivisionLadder(
      adminPut({ order: [jobber.divisionId, jobber.divisionId] }),
      ctx,
      cb,
    );
    expect(duplicate!.statusCode).toBe(400);

    const notArray = await updateDivisionLadder(adminPut({ order: 'jobber' }), ctx, cb);
    expect(notArray!.statusCode).toBe(400);
  });

  it('applies rules and order together', async () => {
    const [jobber, midcard, mainEvent] = await seedDivisions();

    const result = await updateDivisionLadder(
      adminPut({
        rules: { promoteWinStreak: 3 },
        order: [mainEvent.divisionId, midcard.divisionId, jobber.divisionId],
      }),
      ctx,
      cb,
    );

    const body = JSON.parse(result!.body);
    expect(body.rules.promoteWinStreak).toBe(3);
    expect(body.divisions[0].divisionId).toBe(mainEvent.divisionId);
  });

  it('rejects non-admins with 403', async () => {
    const result = await updateDivisionLadder(
      withAuth(makeEvent({ httpMethod: 'PUT', body: JSON.stringify({ rules: { enabled: false } }) }), 'Moderator'),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(403);
  });
});
