import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyHandler, Context, Callback } from 'aws-lambda';
import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { handler as getStables } from '../getStables';
import { handler as getStable } from '../getStable';
import { handler as getStableStandings } from '../getStableStandings';
import { computeFormAndStreak, computeWinPercentage, type StableMatchResult } from '../computeStableStats';

let repos: Repositories;
let stableId: string;
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
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

async function call<TBody>(handler: APIGatewayProxyHandler, event: APIGatewayProxyEvent): Promise<TBody> {
  const result = await handler(event, ctx, cb);
  expect(result?.statusCode).toBe(200);
  return JSON.parse(result!.body) as TBody;
}

async function completeMatch(date: string, winners: string[], losers: string[]) {
  await repos.competition.matches.create({
    matchId: `match-${date}`,
    date,
    status: 'completed',
    matchFormat: 'singles',
    participants: [...winners, ...losers],
    winners,
    losers,
  });
}

interface FactionRow {
  stableId: string;
  wins: number;
  losses: number;
  draws: number;
}

describe('faction records', () => {
  beforeEach(async () => {
    repos = buildInMemoryRepositories();
    setRepositoriesForTesting(repos);
    const leader = await repos.roster.players.create({ name: 'Leader', currentWrestler: 'A' });
    const rival = await repos.roster.players.create({ name: 'Rival', currentWrestler: 'B' });
    const stable = await repos.roster.stables.create({
      name: 'Crew',
      leaderId: leader.playerId,
      memberIds: [leader.playerId],
    });
    stableId = stable.stableId;
    // Stored counters that disagree with the matches below.
    await repos.roster.stables.update(stableId, { status: 'active', wins: 1, losses: 4, draws: 0 });
    await completeMatch('2026-01-01T00:00:00.000Z', [rival.playerId], [leader.playerId]);
    await completeMatch('2026-01-02T00:00:00.000Z', [leader.playerId], [rival.playerId]);
    await completeMatch('2026-01-03T00:00:00.000Z', [leader.playerId], [rival.playerId]);
  });

  afterEach(() => {
    resetRepositoriesForTesting();
  });

  it('shows the same record on the list, detail and standings', async () => {
    const list = await call<FactionRow[]>(getStables, makeEvent());
    const detail = await call<FactionRow>(getStable, makeEvent({ pathParameters: { stableId } }));
    const standings = await call<FactionRow[]>(getStableStandings, makeEvent());

    const expected = { wins: 2, losses: 1, draws: 0 };
    expect(list[0]).toMatchObject(expected);
    expect(detail).toMatchObject(expected);
    expect(standings[0]).toMatchObject(expected);
  });

  it('applies the record to a status-filtered list', async () => {
    const list = await call<FactionRow[]>(
      getStables,
      makeEvent({ queryStringParameters: { status: 'active' } }),
    );

    expect(list[0]).toMatchObject({ wins: 2, losses: 1 });
  });

  it('returns the streak as a type and count on detail and standings', async () => {
    type DetailRow = { standings: { currentStreak: unknown; winPercentage: number } };
    const detail = await call<DetailRow>(getStable, makeEvent({ pathParameters: { stableId } }));
    const standings = await call<Array<{ currentStreak: unknown; winPercentage: number }>>(getStableStandings, makeEvent());

    expect(detail.standings.currentStreak).toEqual({ type: 'W', count: 2 });
    expect(standings[0].currentStreak).toEqual({ type: 'W', count: 2 });
    expect(detail.standings.winPercentage).toBe(66.7);
    expect(standings[0].winPercentage).toBe(66.7);
  });

  it('leaves leaderName unset when the leader row is gone, rather than blank', async () => {
    await repos.roster.stables.update(stableId, { leaderId: 'deleted', memberIds: ['deleted'] });

    const detail = await call<Record<string, unknown>>(getStable, makeEvent({ pathParameters: { stableId } }));

    expect(detail).not.toHaveProperty('leaderName');
  });
});

describe('computeWinPercentage', () => {
  it('returns the 0-100 scale to one decimal place', () => {
    expect(computeWinPercentage(11, 14, 0)).toBe(44);
    expect(computeWinPercentage(10, 17, 1)).toBe(35.7);
    expect(computeWinPercentage(4, 0, 0)).toBe(100);
  });

  it('returns 0 with no matches', () => {
    expect(computeWinPercentage(0, 0, 0)).toBe(0);
  });
});

describe('computeFormAndStreak', () => {
  const result = (outcome: StableMatchResult['outcome']): StableMatchResult => ({
    matchId: 'm',
    date: '2026-01-01',
    matchFormat: 'singles',
    outcome,
    opponentStableIds: [],
  });

  it('counts the streak beyond the form window', () => {
    const { recentForm, currentStreak } = computeFormAndStreak(
      [result('L'), result('L'), result('L'), result('W')],
      2,
    );

    expect(recentForm).toEqual(['L', 'L']);
    expect(currentStreak).toEqual({ type: 'L', count: 3 });
  });

  it('gives an empty faction a zero streak, which clients render as none', () => {
    expect(computeFormAndStreak([]).currentStreak.count).toBe(0);
  });
});
