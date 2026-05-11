import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: () => `test-uuid-${++uuidCounter}`,
}));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { handler as getFactionSchedule } from '../getFactionSchedule';

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(
  stableId: string,
  qs: Record<string, string> | null = null,
): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: `/stables/${stableId}/schedule`,
    pathParameters: { stableId },
    queryStringParameters: qs,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
  };
}

async function makePlayer(name: string, wrestler: string): Promise<{ playerId: string }> {
  const p = await repos.roster.players.create({ name, currentWrestler: wrestler });
  return { playerId: p.playerId };
}

interface MatchSeed {
  matchId: string;
  date: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'open-signups';
  matchFormat?: string;
  participants: string[];
  eventId?: string;
}

async function makeMatch(seed: MatchSeed): Promise<void> {
  await repos.competition.matches.create({
    matchId: seed.matchId,
    date: seed.date,
    matchFormat: seed.matchFormat ?? 'singles',
    participants: seed.participants,
    eventId: seed.eventId,
    status: seed.status,
    createdAt: seed.date,
  });
}

const NOW = new Date('2026-05-10T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  uuidCounter = 0;
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getFactionSchedule (FAC-08)', () => {
  it('returns 404 when the faction does not exist', async () => {
    const result = await getFactionSchedule(makeEvent('does-not-exist'), ctx, cb);
    expect(result!.statusCode).toBe(404);
  });

  it('returns an empty list for a faction with no scheduled matches', async () => {
    const a = await makePlayer('A', 'Rock');
    const stable = await repos.roster.stables.create({
      name: 'Empty',
      leaderId: a.playerId,
      memberIds: [a.playerId],
      status: 'active',
    });

    const result = await getFactionSchedule(makeEvent(stable.stableId), ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.items).toEqual([]);
  });

  it('returns only scheduled matches involving a member, sorted ascending, within the default 60-day window', async () => {
    const a = await makePlayer('Alpha', 'Rock');
    const b = await makePlayer('Beta', 'Cena');
    const outsider = await makePlayer('Outsider', 'Orton');
    const stable = await repos.roster.stables.create({
      name: 'NWO',
      leaderId: a.playerId,
      memberIds: [a.playerId, b.playerId],
      status: 'active',
    });

    // In window, faction member as participant
    await makeMatch({
      matchId: 'm1',
      date: '2026-06-15T12:00:00.000Z',
      status: 'scheduled',
      participants: [a.playerId, outsider.playerId],
    });
    // In window but no faction member — excluded
    await makeMatch({
      matchId: 'm2',
      date: '2026-06-01T12:00:00.000Z',
      status: 'scheduled',
      participants: [outsider.playerId],
    });
    // Earlier date, faction member — should come first when sorted
    await makeMatch({
      matchId: 'm3',
      date: '2026-05-20T12:00:00.000Z',
      status: 'scheduled',
      participants: [b.playerId, outsider.playerId],
    });
    // Completed match — excluded even though it involves a member
    await makeMatch({
      matchId: 'm4',
      date: '2026-05-15T12:00:00.000Z',
      status: 'completed',
      participants: [a.playerId, outsider.playerId],
    });
    // Outside default 60-day window (NOW + ~90 days) — excluded
    await makeMatch({
      matchId: 'm5',
      date: '2026-08-15T12:00:00.000Z',
      status: 'scheduled',
      participants: [a.playerId],
    });

    const result = await getFactionSchedule(makeEvent(stable.stableId), ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.items.map((m: { matchId: string }) => m.matchId)).toEqual(['m3', 'm1']);
    expect(body.items[0].participants).toEqual([
      { playerId: b.playerId, playerName: 'Beta', isFactionMember: true },
      { playerId: outsider.playerId, playerName: 'Outsider', isFactionMember: false },
    ]);
  });

  it('round-trips the from/to boundaries: from-inclusive, but one second earlier is excluded', async () => {
    const a = await makePlayer('A', 'Rock');
    const stable = await repos.roster.stables.create({
      name: 'BoundaryFC',
      leaderId: a.playerId,
      memberIds: [a.playerId],
      status: 'active',
    });

    const from = '2026-06-01T00:00:00.000Z';
    const to = '2026-06-30T23:59:59.999Z';

    await makeMatch({
      matchId: 'at-from',
      date: from,
      status: 'scheduled',
      participants: [a.playerId],
    });
    await makeMatch({
      matchId: 'before-from',
      date: '2026-05-31T23:59:59.000Z',
      status: 'scheduled',
      participants: [a.playerId],
    });
    await makeMatch({
      matchId: 'at-to',
      date: to,
      status: 'scheduled',
      participants: [a.playerId],
    });
    await makeMatch({
      matchId: 'after-to',
      date: '2026-07-01T00:00:00.000Z',
      status: 'scheduled',
      participants: [a.playerId],
    });

    const result = await getFactionSchedule(makeEvent(stable.stableId, { from, to }), ctx, cb);
    const body = JSON.parse(result!.body);
    expect(body.items.map((m: { matchId: string }) => m.matchId)).toEqual(['at-from', 'at-to']);
  });

  it('hydrates eventName and location from the events repo', async () => {
    const a = await makePlayer('A', 'Rock');
    const stable = await repos.roster.stables.create({
      name: 'HydrateFC',
      leaderId: a.playerId,
      memberIds: [a.playerId],
      status: 'active',
    });

    const ev = await repos.leagueOps.events.create({
      name: 'WrestleSomething',
      eventType: 'ppv',
      date: '2026-06-10T20:00:00.000Z',
      venue: 'MSG, New York',
    });

    await makeMatch({
      matchId: 'mh1',
      date: '2026-06-10T20:00:00.000Z',
      status: 'scheduled',
      participants: [a.playerId],
      eventId: ev.eventId,
    });

    const result = await getFactionSchedule(makeEvent(stable.stableId), ctx, cb);
    const body = JSON.parse(result!.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].eventId).toBe(ev.eventId);
    expect(body.items[0].eventName).toBe('WrestleSomething');
    expect(body.items[0].location).toBe('MSG, New York');
  });

  it('returns 400 for an invalid from date', async () => {
    const a = await makePlayer('A', 'Rock');
    const stable = await repos.roster.stables.create({
      name: 'X',
      leaderId: a.playerId,
      memberIds: [a.playerId],
      status: 'active',
    });

    const result = await getFactionSchedule(
      makeEvent(stable.stableId, { from: 'not-a-date' }),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(400);
  });

  it('returns 400 when from is after to', async () => {
    const a = await makePlayer('A', 'Rock');
    const stable = await repos.roster.stables.create({
      name: 'X',
      leaderId: a.playerId,
      memberIds: [a.playerId],
      status: 'active',
    });

    const result = await getFactionSchedule(
      makeEvent(stable.stableId, { from: '2026-07-01T00:00:00.000Z', to: '2026-06-01T00:00:00.000Z' }),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(400);
  });
});
