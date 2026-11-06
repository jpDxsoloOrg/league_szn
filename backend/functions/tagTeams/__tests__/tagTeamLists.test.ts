import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyHandler, Context, Callback } from 'aws-lambda';
import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { handler as getTagTeams } from '../getTagTeams';
import { handler as getTagTeamStandings } from '../getTagTeamStandings';

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

const event = {
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
  requestContext: {},
} as unknown as APIGatewayProxyEvent;

interface TeamRow {
  player1Name: string;
  player2Name: string;
  wins: number;
  losses: number;
  winPercentage?: number;
}

async function rows(handler: APIGatewayProxyHandler): Promise<TeamRow[]> {
  const result = await handler(event, ctx, cb);
  expect(result?.statusCode).toBe(200);
  return JSON.parse(result!.body) as TeamRow[];
}

async function addTeam(player1Id: string, player2Id: string, names: { first?: string; second?: string }) {
  const team = await repos.roster.tagTeams.create({ name: 'Brothers', player1Id, player2Id });
  await repos.roster.tagTeams.update(team.tagTeamId, {
    status: 'active',
    player1WrestlerName: names.first,
    player2WrestlerName: names.second,
  });
}

describe('tag team lists', () => {
  beforeEach(() => {
    repos = buildInMemoryRepositories();
    setRepositoriesForTesting(repos);
  });

  afterEach(() => {
    resetRepositoriesForTesting();
  });

  it.each([
    ['list', getTagTeams],
    ['standings', getTagTeamStandings],
  ])('uses stored wrestler names when the player rows are gone (%s)', async (_label, handler) => {
    await addTeam('gone-1', 'gone-2', { first: 'Undertaker', second: 'Kane' });

    const [team] = await rows(handler);

    expect(team.player1Name).toBe('Undertaker');
    expect(team.player2Name).toBe('Kane');
  });

  it('keeps Unknown only when there is no name anywhere', async () => {
    await addTeam('gone-1', 'gone-2', {});

    const [team] = await rows(getTagTeams);

    expect(team.player1Name).toBe('Unknown');
  });

  it('prefers the live player name', async () => {
    const player = await repos.roster.players.create({ name: 'Mark', currentWrestler: 'Undertaker' });
    await addTeam(player.playerId, 'gone-2', { first: 'Deadman', second: 'Kane' });

    const [team] = await rows(getTagTeams);

    expect(team.player1Name).toBe('Mark');
  });

  it.each([
    ['list', getTagTeams],
    ['standings', getTagTeamStandings],
  ])('reports the record from matches (%s)', async (_label, handler) => {
    await addTeam('a', 'b', {});
    await repos.competition.matches.create({
      date: '2026-01-01T00:00:00.000Z',
      status: 'completed',
      matchFormat: 'tag',
      participants: ['a', 'b', 'x', 'y'],
      teams: [['a', 'b'], ['x', 'y']],
      winners: ['a', 'b'],
      losers: ['x', 'y'],
    });

    const [team] = await rows(handler);

    expect(team.wins).toBe(1);
    expect(team.losses).toBe(0);
  });

  it('puts standings win percentage on the 0-100 scale', async () => {
    await addTeam('a', 'b', {});
    await repos.competition.matches.create({
      date: '2026-01-01T00:00:00.000Z',
      status: 'completed',
      matchFormat: 'tag',
      participants: ['a', 'b', 'x', 'y'],
      teams: [['a', 'b'], ['x', 'y']],
      winners: ['a', 'b'],
      losers: ['x', 'y'],
    });

    const [team] = await rows(getTagTeamStandings);

    expect(team.winPercentage).toBe(100);
  });
});
