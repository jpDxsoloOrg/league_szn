import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyHandler, Context, Callback } from 'aws-lambda';
import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { handler as getTagTeams } from '../getTagTeams';
import { handler as getTagTeamStandings } from '../getTagTeamStandings';
import { handler as getTagTeam } from '../getTagTeam';
import { computeFormAndStreak, findTagTeamMatches, type MatchRecord } from '../computeTagTeamStats';

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
      date: new Date().toISOString(),
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
      date: new Date().toISOString(),
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

  describe('team lifetime', () => {
    const lifetime = {
      player1Id: 'a',
      player2Id: 'b',
      createdAt: '2026-03-10T15:30:00.000Z',
      dissolvedAt: '2026-06-20T09:00:00.000Z',
    };
    const matchOn = (date: string): MatchRecord => ({
      matchId: date,
      date,
      participants: ['a', 'b', 'x', 'y'],
      teams: [['a', 'b'], ['x', 'y']],
      winners: ['a', 'b'],
      losers: ['x', 'y'],
      isChampionship: false,
      status: 'completed',
    });
    const counted = (date: string, team: Parameters<typeof findTagTeamMatches>[1] = lifetime) =>
      findTagTeamMatches([matchOn(date)], team).length === 1;

    it.each([
      ['the day before the team formed', '2026-03-09T23:59:59.000Z', false],
      ['earlier on the day the team formed', '2026-03-10T08:00:00.000Z', true],
      ['an event dated the day the team formed', '2026-03-10', true],
      ['an event on the US evening before the UTC day the team formed', '2026-03-09', true],
      ['an event two days before the team formed', '2026-03-08', false],
      ['during the team', '2026-04-01T20:00:00.000Z', true],
      ['later on the day the team dissolved', '2026-06-20T22:00:00.000Z', true],
      ['the day after the team dissolved', '2026-06-21T00:00:00.000Z', false],
    ])('handles a match %s', (_label, date, expected) => {
      expect(counted(date)).toBe(expected);
    });

    it('has no end while the team is together', () => {
      expect(counted('2030-01-01', { ...lifetime, dissolvedAt: undefined })).toBe(true);
    });

    it('keeps a match whose date cannot be read', () => {
      expect(counted('not a date')).toBe(true);
    });

    async function formTeamOn(date: string) {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(date));
      const team = await repos.roster.tagTeams.create({ name: 'Brothers', player1Id: 'a', player2Id: 'b' });
      vi.useRealTimers();
      return team;
    }

    it('gives each team only its own matches when a pair re-forms', async () => {
      const first = await formTeamOn('2026-01-01T00:00:00.000Z');
      await repos.roster.tagTeams.update(first.tagTeamId, {
        status: 'dissolved',
        dissolvedAt: '2026-02-01T00:00:00.000Z',
      });
      const second = await formTeamOn('2026-03-01T00:00:00.000Z');
      await repos.roster.tagTeams.update(second.tagTeamId, { status: 'active' });
      for (const date of ['2026-01-15', '2026-03-15', '2026-03-16']) {
        await repos.competition.matches.create({
          matchId: date,
          date,
          status: 'completed',
          matchFormat: 'tag',
          participants: ['a', 'b', 'x', 'y'],
          teams: [['a', 'b'], ['x', 'y']],
          winners: ['a', 'b'],
          losers: ['x', 'y'],
        });
      }

      const detail = async (tagTeamId: string) => {
        const result = await getTagTeam({ ...event, pathParameters: { tagTeamId } }, ctx, cb);
        expect(result?.statusCode).toBe(200);
        return JSON.parse(result!.body) as { wins: number; recentMatches: unknown[] };
      };

      expect(await detail(first.tagTeamId)).toMatchObject({ wins: 1, recentMatches: [expect.anything()] });
      expect((await detail(second.tagTeamId)).wins).toBe(2);
    });

    it('shows 0-0 for a team formed after all of its matches, leaving stored counters alone', async () => {
      await addTeam('a', 'b', {});
      const [stored] = await repos.roster.tagTeams.list();
      await repos.roster.tagTeams.update(stored.tagTeamId, { wins: 7 });
      await repos.competition.matches.create({
        date: '2020-01-01',
        status: 'completed',
        matchFormat: 'tag',
        participants: ['a', 'b', 'x', 'y'],
        teams: [['a', 'b'], ['x', 'y']],
        winners: ['a', 'b'],
        losers: ['x', 'y'],
      });

      const [team] = await rows(getTagTeams);

      expect(team.wins).toBe(0);
      expect((await repos.roster.tagTeams.findById(stored.tagTeamId))?.wins).toBe(7);
    });
  });
});

describe('tag team form', () => {
  const result = (date: string, updatedAt: string, outcome: 'W' | 'L') => ({
    match: { matchId: date, date, updatedAt, participants: [], isChampionship: false, status: 'completed' },
    result: outcome,
    opponentTeamPlayerIds: [],
  });

  it('orders by match date, so a rating on an old loss does not lead the form', () => {
    const { recentForm, currentStreak } = computeFormAndStreak(
      [
        result('2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z', 'W'),
        result('2026-01-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z', 'L'),
      ],
      5,
    );

    expect(recentForm).toEqual(['W', 'L']);
    expect(currentStreak).toEqual({ type: 'W', count: 1 });
  });
});
