import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});

const { mockScanAll } = vi.hoisted(() => ({ mockScanAll: vi.fn() }));

vi.mock('../../../lib/dynamodb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/dynamodb')>();
  return { ...actual, dynamoDb: { ...actual.dynamoDb, scanAll: mockScanAll } };
});

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { handler as runJob } from '../recalculateContendersJob';
import { handler as contendersLambda } from '../handler';
import { handler as setOverride } from '../setOverride';
import { handler as getOverrides } from '../getOverrides';
import { handler as getContenders } from '../getContenders';

const ctx = {} as Context;
const cb: Callback = () => {};

interface StoredPlayer {
  playerId: string;
  currentWrestler: string;
  divisionId?: string;
}

let repos: Repositories;
let roster: StoredPlayer[];
let matches: Array<Record<string, unknown>>;
let seasonId: string;
let championshipId: string;

function apiEvent(overrides: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'POST', isBase64Encoded: false,
    path: '/', pathParameters: null, queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '',
    requestContext: { authorizer: { username: 'staff', groups: 'Admin' } } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

async function addPlayer(name: string, extra: { currentWrestler?: string; divisionId?: string } = {}): Promise<string> {
  const player = await repos.roster.players.create({ name, currentWrestler: name, ...extra });
  roster.push({ playerId: player.playerId, currentWrestler: player.currentWrestler, divisionId: player.divisionId });
  return player.playerId;
}

/** Twelve players who each beat the next one enough times to qualify. */
async function addFullField(): Promise<string[]> {
  const field: string[] = [];
  for (let i = 0; i < 12; i += 1) field.push(await addPlayer(`Regular ${i}`));
  field.forEach((winner, index) => {
    const loser = field[(index + 1) % field.length];
    for (let game = 0; game < 2; game += 1) {
      matches.push({
        matchId: `m-${index}-${game}`,
        date: '2026-10-01T00:00:00.000Z',
        participants: [winner, loser],
        winners: [winner],
        losers: [loser],
        status: 'completed',
        seasonId,
      });
    }
  });
  return field;
}

async function createOverride(playerId: string, overrideType: 'bump_to_top' | 'send_to_bottom'): Promise<void> {
  await repos.competition.contenders.createOverride({
    championshipId, playerId, overrideType, reason: 'Storyline', createdBy: 'staff',
  });
}

async function setOverrideRequest(playerId: string, overrideType: string, extra: Record<string, unknown> = {}) {
  const result = await setOverride(
    apiEvent({ body: JSON.stringify({ championshipId, playerId, overrideType, reason: 'Storyline', ...extra }) }),
    ctx,
    cb,
  );
  return result as { statusCode: number; body: string };
}

async function storedList() {
  return repos.competition.contenders.listByChampionshipRanked(championshipId);
}

describe('contender overrides through every recalculation', () => {
  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    repos = buildInMemoryRepositories();
    setRepositoriesForTesting(repos);
    roster = [];
    matches = [];
    mockScanAll.mockReset();
    // Only the players scan projects its columns; table names are unset in tests.
    mockScanAll.mockImplementation(async ({ ProjectionExpression }: { ProjectionExpression?: string }) => (
      ProjectionExpression ? roster : matches
    ));
    const season = await repos.season.seasons.create({ name: 'Season 1', startDate: '2026-01-01T00:00:00.000Z' });
    seasonId = season.seasonId;
    const title = await repos.competition.championships.create({ name: 'World Title', type: 'singles' });
    championshipId = title.championshipId;
  });

  afterEach(() => {
    resetRepositoriesForTesting();
    vi.restoreAllMocks();
  });

  const recalculations: Array<[string, () => Promise<unknown>]> = [
    ['the 6-hour job', () => runJob()],
    ['the recalculation after a result', () => contendersLambda(
      { source: 'recordResult' } as unknown as APIGatewayProxyEvent, ctx, cb,
    ) as Promise<unknown>],
    ['the single-title recalculation', () => contendersLambda(
      { source: 'recordResult', championshipId } as unknown as APIGatewayProxyEvent, ctx, cb,
    ) as Promise<unknown>],
  ];

  it.each(recalculations)('%s puts a bumped player with no matches at #1 within the limit', async (_name, recalculate) => {
    const field = await addFullField();
    const newcomer = await addPlayer('Newcomer');
    await createOverride(newcomer, 'bump_to_top');

    await recalculate();

    const list = await storedList();
    expect(list).toHaveLength(10);
    expect(list[0]).toMatchObject({
      playerId: newcomer, rank: 1, isOverridden: true, overrideType: 'bump_to_top',
      rankingScore: 0, matchesInPeriod: 0, organicRank: null,
    });
    expect(list.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(list.filter((row) => field.includes(row.playerId))).toHaveLength(9);
  });

  it.each(recalculations)('%s still places a bump when the season has no matches', async (_name, recalculate) => {
    const newcomer = await addPlayer('Newcomer');
    await createOverride(newcomer, 'bump_to_top');

    await recalculate();

    expect((await storedList()).map((row) => row.playerId)).toEqual([newcomer]);
  });

  it('shows the bumped player first with the override flag on the public list', async () => {
    await addFullField();
    const newcomer = await addPlayer('Newcomer');
    await createOverride(newcomer, 'bump_to_top');
    await runJob();

    const result = await getContenders(apiEvent({ httpMethod: 'GET', pathParameters: { championshipId } }), ctx, cb);
    const { contenders } = JSON.parse((result as { body: string }).body);

    expect(contenders).toHaveLength(10);
    expect(contenders[0]).toMatchObject({ playerId: newcomer, rank: 1, isOverridden: true, overrideType: 'bump_to_top' });
  });

  it('drops the override row once it is removed, and the organic list returns', async () => {
    const field = await addFullField();
    const newcomer = await addPlayer('Newcomer');
    await createOverride(newcomer, 'bump_to_top');
    await runJob();

    await repos.competition.contenders.deactivateOverride(championshipId, newcomer, 'removed by admin');
    await runJob();

    const list = await storedList();
    expect(list).toHaveLength(10);
    expect(list.every((row) => field.includes(row.playerId) && !row.isOverridden)).toBe(true);
  });

  it('ignores an expired bump', async () => {
    const newcomer = await addPlayer('Newcomer');
    await repos.competition.contenders.createOverride({
      championshipId, playerId: newcomer, overrideType: 'bump_to_top', reason: 'Old', createdBy: 'staff',
      expiresAt: '2020-01-01',
    });

    await runJob();

    expect(await storedList()).toEqual([]);
  });

  it('never ranks a bumped player who has since become champion', async () => {
    const champion = await addPlayer('Champion');
    await createOverride(champion, 'bump_to_top');
    await repos.competition.championships.update(championshipId, { currentChampion: champion });

    await runJob();

    expect(await storedList()).toEqual([]);
  });

  describe('setOverride', () => {
    it('recalculates in the request and reports the rank a bump reached', async () => {
      await addFullField();
      const newcomer = await addPlayer('Newcomer');

      const result = await setOverrideRequest(newcomer, 'bump_to_top');

      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body).placement).toEqual({ status: 'onList', rank: 1 });
      expect((await storedList())[0].playerId).toBe(newcomer);
    });

    it('reports the last place for a listed player sent to the bottom', async () => {
      const field = await addFullField();
      await runJob();
      const topPlayer = (await storedList())[0].playerId;
      expect(field).toContain(topPlayer);

      const result = await setOverrideRequest(topPlayer, 'send_to_bottom');

      expect(JSON.parse(result.body).placement).toEqual({ status: 'onList', rank: 10 });
      const list = await storedList();
      expect(list[9]).toMatchObject({ playerId: topPlayer, overrideType: 'send_to_bottom', isOverridden: true });
    });

    it('says when a player sent to the bottom is not on the list', async () => {
      await addFullField();
      const newcomer = await addPlayer('Newcomer');

      const result = await setOverrideRequest(newcomer, 'send_to_bottom');

      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body).placement).toEqual({ status: 'notOnList', rank: null });
      expect((await storedList()).map((row) => row.playerId)).not.toContain(newcomer);
    });

    it('says when there is no active season', async () => {
      await repos.season.seasons.update(seasonId, { status: 'completed' });
      const newcomer = await addPlayer('Newcomer');

      const result = await setOverrideRequest(newcomer, 'bump_to_top');

      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body).placement).toEqual({ status: 'noActiveSeason', rank: null });
    });

    it('keeps the override and says so when the recalculation fails', async () => {
      const newcomer = await addPlayer('Newcomer');
      mockScanAll.mockRejectedValue(new Error('scan failed'));

      const result = await setOverrideRequest(newcomer, 'bump_to_top');

      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body).placement).toEqual({ status: 'recalculationFailed', rank: null });
      expect(await repos.competition.contenders.findOverride(championshipId, newcomer)).toMatchObject({ active: true });
    });

    it('refuses a hidden player', async () => {
      const hidden = await addPlayer('Hidden', { currentWrestler: 'Needs Wrestler' });
      const result = await setOverrideRequest(hidden, 'bump_to_top');

      expect(result.statusCode).toBe(400);
      expect(await repos.competition.contenders.findOverride(championshipId, hidden)).toBeNull();
    });

    it('refuses a deleted player', async () => {
      const gone = await addPlayer('Gone');
      await repos.roster.players.delete(gone);

      expect((await setOverrideRequest(gone, 'bump_to_top')).statusCode).toBe(400);
    });

    it('refuses the current champion', async () => {
      const champion = await addPlayer('Champion');
      await repos.competition.championships.update(championshipId, { currentChampion: champion });

      expect((await setOverrideRequest(champion, 'bump_to_top')).statusCode).toBe(400);
    });

    it('refuses a player outside the division a title is locked to', async () => {
      const lockedTitle = await repos.competition.championships.create({ name: 'Locked', type: 'singles', divisionId: 'd1' });
      championshipId = lockedTitle.championshipId;
      const outsider = await addPlayer('Outsider', { divisionId: 'd2' });

      expect((await setOverrideRequest(outsider, 'bump_to_top')).statusCode).toBe(400);
    });

    it('refuses an expiry that has already passed, which could never apply', async () => {
      const newcomer = await addPlayer('Newcomer');
      const result = await setOverrideRequest(newcomer, 'bump_to_top', { expiresAt: '2020-01-01' });

      expect(result.statusCode).toBe(400);
      expect(await repos.competition.contenders.findOverride(championshipId, newcomer)).toBeNull();
    });
  });

  it('getOverrides reports the current position of each override', async () => {
    await addFullField();
    const bumped = await addPlayer('Bumped');
    const offList = await addPlayer('Off List');
    await createOverride(bumped, 'bump_to_top');
    await createOverride(offList, 'send_to_bottom');
    await runJob();

    const result = await getOverrides(
      apiEvent({ httpMethod: 'GET', queryStringParameters: { championshipId } }),
      ctx,
      cb,
    );
    const rows: Array<{ playerId: string; currentRank: number | null }> = JSON.parse((result as { body: string }).body);

    expect(rows.find((row) => row.playerId === bumped)?.currentRank).toBe(1);
    expect(rows.find((row) => row.playerId === offList)?.currentRank).toBeNull();
  });
});
