import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

vi.mock('../../../lib/asyncLambda', () => ({
  invokeAsync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../updateGroupStats', () => ({
  updateGroupStats: vi.fn().mockResolvedValue(undefined),
}));
const mockCreateNotification = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../lib/notifications', () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import type { InMemoryCompetitionRepository } from '../../../lib/repositories/inMemory/InMemoryCompetitionRepository';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
  type Match,
} from '../../../lib/repositories';
import { handler as recordResult } from '../recordResult';

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

function ev(matchId: string, body: { winners: string[]; losers: string[] }): APIGatewayProxyEvent {
  return {
    body: JSON.stringify(body),
    headers: {}, multiValueHeaders: {}, httpMethod: 'PUT',
    isBase64Encoded: false, path: `/matches/${matchId}/result`,
    pathParameters: { matchId },
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '',
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

let matchCounter = 0;

/** Seeds a pending singles match between two players, dated sequentially. */
function seedPendingMatch(participants: [string, string]): string {
  matchCounter += 1;
  const matchId = `m${matchCounter}`;
  const date = `2024-06-${String(matchCounter).padStart(2, '0')}T12:00:00.000Z`;
  const match: Match = {
    matchId,
    date,
    status: 'pending',
    participants,
    matchFormat: 'singles',
    createdAt: date,
  } as unknown as Match;
  (repos.competition as InMemoryCompetitionRepository).matchesStore.set(matchId, match);
  return matchId;
}

async function recordWin(winner: string, loser: string): Promise<void> {
  const matchId = seedPendingMatch([winner, loser]);
  const res = await recordResult(ev(matchId, { winners: [winner], losers: [loser] }), ctx, cb);
  expect(res!.statusCode).toBe(200);
}

interface Seeded {
  bottom: string;
  middle: string;
  top: string;
  hero: string;
  jobber: string;
}

async function seed(): Promise<Seeded> {
  const bottom = await repos.leagueOps.divisions.create({ name: 'Jobber', rank: 0 });
  const middle = await repos.leagueOps.divisions.create({ name: 'Midcard', rank: 1 });
  const top = await repos.leagueOps.divisions.create({ name: 'Main Event', rank: 2 });

  const hero = await repos.roster.players.create({
    name: 'Hero',
    currentWrestler: 'Rock',
    divisionId: middle.divisionId,
  });
  await repos.roster.players.update(hero.playerId, { userId: 'hero-user' });
  // The opponent is unranked so only the hero's movement is under test.
  const jobber = await repos.roster.players.create({ name: 'Jobber', currentWrestler: 'Gillberg' });

  return {
    bottom: bottom.divisionId,
    middle: middle.divisionId,
    top: top.divisionId,
    hero: hero.playerId,
    jobber: jobber.playerId,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  matchCounter = 0;
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

describe('recordResult — division ladder', () => {
  it('promotes a player on the 5th straight win and records the movement', async () => {
    const { hero, jobber, middle, top } = await seed();

    for (let i = 0; i < 4; i++) {
      await recordWin(hero, jobber);
    }
    let player = await repos.roster.players.findById(hero);
    expect(player?.divisionId).toBe(middle);
    expect(player?.divisionChangedAt).toBeUndefined();
    expect(await repos.leagueOps.divisionMovements.listRecent(50)).toHaveLength(0);

    await recordWin(hero, jobber);

    player = await repos.roster.players.findById(hero);
    expect(player?.divisionId).toBe(top);
    expect(player?.divisionChangedAt).toBeTruthy();

    const movements = await repos.leagueOps.divisionMovements.listByPlayer(hero);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      playerId: hero,
      fromDivisionId: middle,
      toDivisionId: top,
      direction: 'promoted',
      trigger: 'streak',
      matchId: 'm5',
      streakCount: 5,
    });
    expect(movements[0].movedAt).toBe(player?.divisionChangedAt);

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'hero-user',
        type: 'division_promoted',
        sourceType: 'division',
        sourceId: movements[0].movementId,
      }),
    );
  });

  it('does not demote below the bottom division after 5 straight losses', async () => {
    const { hero, jobber, bottom } = await seed();
    await repos.roster.players.update(hero, { divisionId: bottom });

    for (let i = 0; i < 5; i++) {
      await recordWin(jobber, hero);
    }

    const player = await repos.roster.players.findById(hero);
    expect(player?.divisionId).toBe(bottom);
    expect(player?.divisionChangedAt).toBeUndefined();
    expect(await repos.leagueOps.divisionMovements.listRecent(50)).toHaveLength(0);
  });

  it('demotes a player on the 5th straight loss when a lower division exists', async () => {
    const { hero, jobber, middle, bottom } = await seed();

    for (let i = 0; i < 5; i++) {
      await recordWin(jobber, hero);
    }

    const player = await repos.roster.players.findById(hero);
    expect(player?.divisionId).toBe(bottom);
    const movements = await repos.leagueOps.divisionMovements.listByPlayer(hero);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ fromDivisionId: middle, toDivisionId: bottom, direction: 'demoted' });
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'division_demoted' }),
    );
  });

  it('does not move again on the next win after a promotion (streak resets)', async () => {
    const { hero, jobber, top } = await seed();

    for (let i = 0; i < 5; i++) {
      await recordWin(hero, jobber);
    }
    expect((await repos.roster.players.findById(hero))?.divisionId).toBe(top);
    const changedAt = (await repos.roster.players.findById(hero))?.divisionChangedAt;

    await recordWin(hero, jobber);

    const player = await repos.roster.players.findById(hero);
    expect(player?.divisionId).toBe(top);
    expect(player?.divisionChangedAt).toBe(changedAt);
    expect(await repos.leagueOps.divisionMovements.listRecent(50)).toHaveLength(1);
  });

  it('does nothing when the ladder rules are disabled', async () => {
    const { hero, jobber, middle } = await seed();
    await repos.user.siteConfig.updateDivisionLadderRules({ enabled: false });

    for (let i = 0; i < 6; i++) {
      await recordWin(hero, jobber);
    }

    const player = await repos.roster.players.findById(hero);
    expect(player?.divisionId).toBe(middle);
    expect(player?.divisionChangedAt).toBeUndefined();
    expect(await repos.leagueOps.divisionMovements.listRecent(50)).toHaveLength(0);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});
