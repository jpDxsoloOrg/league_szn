import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});

const { mockCalcRankings } = vi.hoisted(() => ({ mockCalcRankings: vi.fn() }));

vi.mock('../../../lib/rankingCalculator', () => ({
  calculateRankingsForChampionship: mockCalcRankings,
}));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { handler as runJob } from '../recalculateContendersJob';

function rankResult(playerId: string, rank: number) {
  return {
    playerId, rank, rankingScore: 80, winPercentage: 70, currentStreak: 2,
    qualityScore: 60, recencyScore: 65, matchesInPeriod: 5, winsInPeriod: 4,
  };
}

let repos: Repositories;

async function createTitle(name: string): Promise<string> {
  const title = await repos.competition.championships.create({ name, type: 'singles' });
  return title.championshipId;
}

async function storeRanking(championshipId: string, playerId: string, rank: number): Promise<void> {
  await repos.competition.contenders.upsertRanking({ ...rankResult(playerId, rank), championshipId });
}

async function rankedPlayers(championshipId: string): Promise<string[]> {
  const rows = await repos.competition.contenders.listByChampionshipRanked(championshipId);
  return rows.map((row) => row.playerId);
}

describe('recalculateContendersJob', () => {
  beforeEach(async () => {
    mockCalcRankings.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    repos = buildInMemoryRepositories();
    setRepositoriesForTesting(repos);
    await repos.season.seasons.create({ name: 'Season 1', startDate: '2026-01-01T00:00:00.000Z' });
  });

  afterEach(() => {
    resetRepositoriesForTesting();
    vi.restoreAllMocks();
  });

  it('recalculates every active title in the active season and logs the counts', async () => {
    const world = await createTitle('World');
    const intercontinental = await createTitle('IC');
    mockCalcRankings.mockImplementation(async ({ championshipId }: { championshipId: string }) => (
      championshipId === world ? [rankResult('p1', 1), rankResult('p2', 2)] : [rankResult('p3', 1)]
    ));

    const result = await runJob();

    expect(result).toMatchObject({
      championshipsProcessed: 2,
      championshipsFailed: 0,
      totalRankings: 3,
    });
    expect(await rankedPlayers(world)).toEqual(['p1', 'p2']);
    expect(await rankedPlayers(intercontinental)).toEqual(['p3']);
    expect(console.log).toHaveBeenCalledWith(
      'Contender ranking job complete:',
      expect.stringContaining('"totalRankings":3'),
    );
  });

  it('runs titles one at a time', async () => {
    await createTitle('World');
    await createTitle('IC');
    let running = 0;
    let mostRunning = 0;
    mockCalcRankings.mockImplementation(async () => {
      running++;
      mostRunning = Math.max(mostRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running--;
      return [];
    });

    await runJob();

    expect(mockCalcRankings).toHaveBeenCalledTimes(2);
    expect(mostRunning).toBe(1);
  });

  it('keeps a failed title\'s rankings and still saves the others', async () => {
    const world = await createTitle('World');
    const intercontinental = await createTitle('IC');
    await storeRanking(world, 'old-1', 1);
    await storeRanking(world, 'old-2', 2);
    mockCalcRankings.mockImplementation(async ({ championshipId }: { championshipId: string }) => {
      if (championshipId === world) throw new Error('scan failed');
      return [rankResult('p3', 1)];
    });

    const result = await runJob();

    expect(result).toMatchObject({
      championshipsProcessed: 1,
      championships: ['IC'],
      championshipsFailed: 1,
      failedChampionships: ['World'],
    });
    expect(await rankedPlayers(world)).toEqual(['old-1', 'old-2']);
    expect(await rankedPlayers(intercontinental)).toEqual(['p3']);
  });

  it('keeps existing rankings when reading overrides fails', async () => {
    const world = await createTitle('World');
    await storeRanking(world, 'old-1', 1);
    mockCalcRankings.mockResolvedValue([rankResult('p1', 1)]);
    vi.spyOn(repos.competition.contenders, 'listActiveOverrides')
      .mockRejectedValue(new Error('read failed'));

    const result = await runJob();

    expect(result.championshipsFailed).toBe(1);
    expect(await rankedPlayers(world)).toEqual(['old-1']);
  });

  it('never leaves a title empty when a write fails partway', async () => {
    const world = await createTitle('World');
    await storeRanking(world, 'old-1', 1);
    mockCalcRankings.mockResolvedValue([rankResult('p1', 1), rankResult('p2', 2)]);
    const { upsertRanking } = repos.competition.contenders;
    vi.spyOn(repos.competition.contenders, 'upsertRanking')
      .mockImplementationOnce(upsertRanking)
      .mockRejectedValueOnce(new Error('write failed'));

    const result = await runJob();

    expect(result.championshipsFailed).toBe(1);
    expect(await rankedPlayers(world)).toContain('old-1');
  });

  it('removes a player who dropped out of a successful run', async () => {
    const world = await createTitle('World');
    await storeRanking(world, 'gone', 1);
    mockCalcRankings.mockResolvedValue([rankResult('p1', 1)]);

    await runJob();

    expect(await rankedPlayers(world)).toEqual(['p1']);
  });

  it('honours active overrides and ignores expired ones', async () => {
    const world = await createTitle('World');
    mockCalcRankings.mockResolvedValue([rankResult('p1', 1), rankResult('p2', 2), rankResult('p3', 3)]);
    await repos.competition.contenders.createOverride({
      championshipId: world, playerId: 'p3', overrideType: 'bump_to_top', reason: 'storyline', createdBy: 'admin',
    });
    await repos.competition.contenders.createOverride({
      championshipId: world,
      playerId: 'p2',
      overrideType: 'bump_to_top',
      reason: 'old storyline',
      createdBy: 'admin',
      expiresAt: '2020-01-01T00:00:00.000Z',
    });

    await runJob();

    expect(await rankedPlayers(world)).toEqual(['p3', 'p1', 'p2']);
    const rows = await repos.competition.contenders.listByChampionshipRanked(world);
    expect(rows[0]).toMatchObject({ isOverridden: true, overrideType: 'bump_to_top', organicRank: 3 });
  });

  it('does nothing when no season is active', async () => {
    const world = await createTitle('World');
    await storeRanking(world, 'old-1', 1);
    const active = await repos.season.seasons.findActive();
    await repos.season.seasons.update(active!.seasonId, { status: 'completed' });

    const result = await runJob();

    expect(result.championshipsProcessed).toBe(0);
    expect(mockCalcRankings).not.toHaveBeenCalled();
    expect(await rankedPlayers(world)).toEqual(['old-1']);
  });
});
