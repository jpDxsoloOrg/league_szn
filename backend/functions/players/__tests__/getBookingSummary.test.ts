import { describe, it, expect, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';
import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import type { Match } from '../../../lib/repositories/types';
import { handler as getBookingSummary } from '../getBookingSummary';
import { handler as getStandings } from '../../standings/getStandings';

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(groups = 'Admin'): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'GET',
    isBase64Encoded: false, path: '/', pathParameters: null,
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '',
    requestContext: {
      authorizer: { groups, username: 'u', email: 'u@u', principalId: 'sub' },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

let n = 0;
async function match(participants: string[], date: string, extra: Partial<Match> = {}) {
  n++;
  return repos.competition.matches.create({
    matchId: `m${n}`, date, matchFormat: 'singles', participants,
    isChampionship: false, status: 'scheduled', createdAt: new Date().toISOString(), ...extra,
  });
}
async function done(participants: string[], winners: string[], date: string, extra: Partial<Match> = {}) {
  return match(participants, date, {
    status: 'completed', winners, losers: participants.filter((p) => !winners.includes(p)),
    updatedAt: date, ...extra,
  });
}

async function call(groups = 'Admin') {
  const res = await getBookingSummary(makeEvent(groups), ctx, cb);
  return { status: res!.statusCode, body: JSON.parse(res!.body) };
}

beforeEach(() => {
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  n = 0;
});

describe('getBookingSummary', () => {
  it('is staff only', async () => {
    expect((await call('Wrestler')).status).toBe(403);
    expect((await call('Moderator')).status).toBe(200);
  });

  it('reports never-booked players with null and no streak', async () => {
    const p = await repos.roster.players.create({ name: 'A', currentWrestler: 'A' });
    const { body } = await call();
    expect(body[p.playerId]).toEqual({ lastBookedAt: null, currentStreak: { type: 'W', count: 0 } });
  });

  it('counts scheduled matches as booked, ignores cancelled, and takes the latest date', async () => {
    const p = await repos.roster.players.create({ name: 'A', currentWrestler: 'A' });
    const q = await repos.roster.players.create({ name: 'B', currentWrestler: 'B' });
    await done([p.playerId, q.playerId], [p.playerId], '2026-08-01T20:00:00.000Z');
    const future = await match([p.playerId, q.playerId], '2026-09-20T20:00:00.000Z', { eventId: 'ev1' });
    await match([p.playerId, q.playerId], '2026-12-01T20:00:00.000Z', { status: 'cancelled' });

    const { body } = await call();

    expect(body[p.playerId].lastBookedAt).toBe('2026-09-20T20:00:00.000Z');
    expect(body[p.playerId].lastBookedMatchId).toBe(future.matchId);
    expect(body[p.playerId].lastBookedEventId).toBe('ev1');
  });

  it('counts slot holders on an open-signups match (partly filled card)', async () => {
    const p = await repos.roster.players.create({ name: 'A', currentWrestler: 'A' });
    const q = await repos.roster.players.create({ name: 'B', currentWrestler: 'B' });
    await match([p.playerId], '2026-09-15', {
      status: 'open-signups',
      slotsRequired: 2,
      slots: [
        { slotId: 's1', position: 1, playerId: p.playerId },
        { slotId: 's2', position: 2 },
      ],
    });

    const { body } = await call();

    expect(body[p.playerId].lastBookedAt).toBe('2026-09-15');
    expect(body[q.playerId].lastBookedAt).toBeNull();
  });

  it('compares calendar-date and timestamp dates correctly', async () => {
    const p = await repos.roster.players.create({ name: 'A', currentWrestler: 'A' });
    await match([p.playerId], '2026-09-20'); // event-linked matches store a calendar day
    await match([p.playerId], '2026-09-19T23:59:00.000Z');

    const { body } = await call();

    expect(body[p.playerId].lastBookedAt).toBe('2026-09-20');
  });

  it('streak matches what the standings endpoint reports', async () => {
    const p = await repos.roster.players.create({ name: 'A', currentWrestler: 'A' });
    const q = await repos.roster.players.create({ name: 'B', currentWrestler: 'B' });
    await done([p.playerId, q.playerId], [q.playerId], '2026-07-01T20:00:00.000Z');
    await done([p.playerId, q.playerId], [p.playerId], '2026-07-08T20:00:00.000Z');
    await done([p.playerId, q.playerId], [p.playerId], '2026-07-15T20:00:00.000Z');
    await done([p.playerId, q.playerId], [p.playerId], '2026-07-22T20:00:00.000Z');
    // A legacy completed row with no updatedAt is ignored by both endpoints.
    await done([p.playerId, q.playerId], [p.playerId], '2026-07-29T20:00:00.000Z', { updatedAt: undefined });

    const { body } = await call();
    const standings = JSON.parse((await getStandings(makeEvent(), ctx, cb))!.body).players;
    const fromStandings = standings.find((s: { playerId: string }) => s.playerId === p.playerId).currentStreak;

    expect(body[p.playerId].currentStreak).toEqual({ type: 'W', count: 3 });
    expect(body[p.playerId].currentStreak).toEqual(fromStandings);
    expect(body[q.playerId].currentStreak).toEqual({ type: 'L', count: 3 });
  });
});
