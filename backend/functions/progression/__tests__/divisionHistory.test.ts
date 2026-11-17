import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context, Callback } from 'aws-lambda';

vi.mock('../../../lib/asyncLambda', () => ({ invokeAsync: vi.fn() }));

/** Stands in for Cognito verification: the bearer token names the caller. */
const CALLERS: Record<string, { sub: string; groups: string }> = {
  owner: { sub: 'user-owner', groups: 'Wrestler' },
  wrestler: { sub: 'user-other', groups: 'Wrestler' },
  mod: { sub: 'user-mod', groups: 'Moderator' },
};

vi.mock('../../../lib/authenticate', () => ({
  authenticate: async (event: APIGatewayProxyEvent) => {
    const header = event.headers?.Authorization ?? '';
    const caller = CALLERS[header.replace('Bearer ', '')];
    if (!caller) return { ok: false };
    event.requestContext.authorizer = {
      principalId: caller.sub,
      username: caller.sub,
      email: '',
      groups: caller.groups,
    };
    return { ok: true };
  },
}));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import type { ProgressionEvent, TransferRequest } from '../../../lib/repositories/types';
import { mergeDivisionHistory } from '../../../lib/progression/divisionHistory';
import { handler } from '../handler';

type Caller = 'anon' | keyof typeof CALLERS;

const RESOURCE = '/progression/players/{playerId}/history';
let repos: Repositories;
let youngBoysId: string;
let nxtId: string;
let rawId: string;
let playerId: string;

function makeEvent(caller: Caller, id: string): APIGatewayProxyEvent {
  return {
    body: null,
    headers: caller === 'anon' ? {} : { Authorization: `Bearer ${caller}` },
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: `/progression/players/${id}/history`,
    pathParameters: { playerId: id },
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: RESOURCE,
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

async function get(caller: Caller, id = playerId): Promise<APIGatewayProxyResult> {
  return (await handler(makeEvent(caller, id), {} as Context, (() => {}) as Callback)) as APIGatewayProxyResult;
}

function progressionEvent(
  overrides: Partial<ProgressionEvent> & Pick<ProgressionEvent, 'eventId' | 'createdAt'>,
): ProgressionEvent {
  return {
    playerId,
    trackId: 'track-callup',
    kind: 'callup',
    type: 'executed',
    fromDivisionId: youngBoysId,
    toDivisionId: nxtId,
    actorUserId: 'user-mod',
    ...overrides,
  };
}

function transfer(overrides: Partial<TransferRequest> & Pick<TransferRequest, 'requestId' | 'updatedAt'>): TransferRequest {
  return {
    playerId: 'p1',
    fromDivisionId: 'd-nxt',
    toDivisionId: 'd-raw',
    reason: 'Fresh start',
    status: 'approved',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('mergeDivisionHistory', () => {
  const divisions = [
    { divisionId: 'd-yb', name: 'Young Boys' },
    { divisionId: 'd-nxt', name: 'NXT' },
    { divisionId: 'd-raw', name: 'Raw' },
  ];
  const executed = (eventId: string, createdAt: string, extra: Partial<ProgressionEvent> = {}): ProgressionEvent => ({
    eventId,
    playerId: 'p1',
    trackId: 't',
    kind: 'callup',
    type: 'executed',
    fromDivisionId: 'd-yb',
    toDivisionId: 'd-nxt',
    actorUserId: 'a',
    createdAt,
    ...extra,
  });

  it('merges executed moves and approved transfers oldest first', () => {
    const history = mergeDivisionHistory(
      [
        executed('e2', '2026-03-01T00:00:00.000Z', { kind: 'promotion', fromDivisionId: 'd-raw', toDivisionId: 'd-yb' }),
        executed('e1', '2026-01-15T00:00:00.000Z'),
      ],
      [transfer({ requestId: 'r1', updatedAt: '2026-02-01T00:00:00.000Z' })],
      divisions,
    );

    expect(history.map((entry) => [entry.id, entry.kind])).toEqual([
      ['e1', 'callup'],
      ['r1', 'transfer'],
      ['e2', 'promotion'],
    ]);
    expect(history[1]).toEqual({
      id: 'r1',
      kind: 'transfer',
      fromDivisionId: 'd-nxt',
      fromDivisionName: 'NXT',
      toDivisionId: 'd-raw',
      toDivisionName: 'Raw',
      movedAt: '2026-02-01T00:00:00.000Z',
    });
  });

  it('skips non-executed events, events without a target and unapproved transfers', () => {
    const history = mergeDivisionHistory(
      [
        executed('e1', '2026-01-01T00:00:00.000Z', { type: 'consideration_added' }),
        executed('e2', '2026-01-02T00:00:00.000Z', { toDivisionId: undefined }),
      ],
      [
        transfer({ requestId: 'r1', updatedAt: '2026-01-03T00:00:00.000Z', status: 'pending' }),
        transfer({ requestId: 'r2', updatedAt: '2026-01-04T00:00:00.000Z', status: 'rejected' }),
      ],
      divisions,
    );
    expect(history).toEqual([]);
  });

  it('breaks same-time ties by id and names deleted divisions null', () => {
    const at = '2026-01-01T00:00:00.000Z';
    const history = mergeDivisionHistory(
      [executed('b', at, { toDivisionId: 'd-gone' }), executed('a', at)],
      [],
      divisions,
    );
    expect(history.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(history[1].toDivisionName).toBeNull();
  });
});

describe('GET /progression/players/{playerId}/history', () => {
  beforeEach(async () => {
    resetRepositoriesForTesting();
    repos = buildInMemoryRepositories();
    setRepositoriesForTesting(repos);

    const { divisions } = repos.leagueOps;
    youngBoysId = (await divisions.create({ name: 'Young Boys', isDevelopmental: true })).divisionId;
    nxtId = (await divisions.create({ name: 'NXT' })).divisionId;
    rawId = (await divisions.create({ name: 'Raw' })).divisionId;

    const player = await repos.roster.players.create({ name: 'Owen', currentWrestler: 'Cena', divisionId: rawId });
    playerId = player.playerId;
    await repos.roster.players.update(playerId, { userId: 'user-owner' });

    await repos.progression.appendEvent(progressionEvent({
      eventId: 'e-promo',
      createdAt: '2026-11-03T10:00:00.000Z',
      trackId: 'track-promo',
      kind: 'promotion',
      fromDivisionId: nxtId,
      toDivisionId: rawId,
    }));
    await repos.progression.appendEvent(progressionEvent({ eventId: 'e-callup', createdAt: '2026-11-01T10:00:00.000Z' }));
    await repos.progression.appendEvent(progressionEvent({
      eventId: 'e-mark',
      createdAt: '2026-10-30T10:00:00.000Z',
      type: 'consideration_added',
      toDivisionId: undefined,
    }));
    // Another player's move never leaks in.
    await repos.progression.appendEvent(progressionEvent({
      eventId: 'e-other',
      createdAt: '2026-11-02T10:00:00.000Z',
      playerId: 'someone-else',
    }));
  });

  it('is public and returns the player\'s moves oldest first with division names', async () => {
    const res = await get('anon');
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.map((entry: { id: string }) => entry.id)).toEqual(['e-callup', 'e-promo']);
    expect(body.map((entry: { fromDivisionName: string; toDivisionName: string }) =>
      `${entry.fromDivisionName} -> ${entry.toDivisionName}`)).toEqual(['Young Boys -> NXT', 'NXT -> Raw']);
  });

  it('merges approved transfers by their review time', async () => {
    const pending = await repos.roster.transfers.create({
      playerId, fromDivisionId: rawId, toDivisionId: nxtId, reason: 'Change',
    });
    await repos.roster.transfers.review(pending.requestId, { status: 'approved', reviewedBy: 'user-mod' });
    await repos.roster.transfers.create({ playerId, fromDivisionId: nxtId, toDivisionId: rawId, reason: 'Pending' });

    const body = JSON.parse((await get('anon')).body);
    expect(body.map((entry: { kind: string }) => entry.kind)).toEqual(['callup', 'promotion', 'transfer']);
    expect(body[2]).toMatchObject({ id: pending.requestId, fromDivisionName: 'Raw', toDivisionName: 'NXT' });
  });

  it('returns 404 for an unknown player', async () => {
    expect((await get('anon', 'missing')).statusCode).toBe(404);
  });

  it('hides a hidden player from everyone but the owner and staff', async () => {
    await repos.roster.players.update(playerId, { currentWrestler: 'Needs Wrestler' });

    expect((await get('anon')).statusCode).toBe(404);
    expect((await get('wrestler')).statusCode).toBe(404);
    expect((await get('owner')).statusCode).toBe(200);
    expect((await get('mod')).statusCode).toBe(200);
  });
});
