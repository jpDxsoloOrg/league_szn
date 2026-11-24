import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockCreateNotification, mockCreateNotifications, mockInvokeAsync } = vi.hoisted(() => ({
  mockCreateNotification: vi.fn(),
  mockCreateNotifications: vi.fn(),
  mockInvokeAsync: vi.fn(),
}));

vi.mock('../../notifications', () => ({
  createNotification: mockCreateNotification,
  createNotifications: mockCreateNotifications,
}));
vi.mock('../../staffUsers', () => ({ listStaffUserIds: vi.fn().mockResolvedValue([]) }));
vi.mock('../../asyncLambda', () => ({ invokeAsync: mockInvokeAsync }));

import { buildInMemoryRepositories } from '../../repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../repositories';
import type { CreateNotificationParams } from '../../notifications';
import type { Match, ProgressionTrack } from '../../repositories/types';
import { divisionMovePatch } from '../../divisions';
import { executeProgressionMove } from '../executeMove';
import { recomputeProgression } from '../recompute';

/**
 * PRL-04 integration: a division move (through the shared helper) restarts
 * goals and streaks in the new division without touching the player's record.
 */

let repos: Repositories;
let matchCounter = 0;

const JOINED_AT = '2026-01-01T00:00:00.000Z';
const TRACK_TIME = '2026-01-01T00:00:00.000Z';

function streakTrack(trackId: string, kind: ProgressionTrack['kind'], fromDivisionId: string, threshold: number): ProgressionTrack {
  return {
    trackId,
    kind,
    name: trackId,
    fromDivisionId,
    goals: [{ goalId: `${trackId}-streak`, metric: 'currentWinStreak', threshold, weight: 1 }],
    windowMode: 'allTime',
    isActive: true,
    createdAt: TRACK_TIME,
    updatedAt: TRACK_TIME,
  };
}

async function addWin(winnerId: string, loserId: string, completedAt: string): Promise<void> {
  matchCounter += 1;
  const match: Match = {
    matchId: `m${matchCounter}`,
    date: completedAt,
    completedAt,
    participants: [winnerId, loserId],
    winners: [winnerId],
    losers: [loserId],
    status: 'completed',
    createdAt: completedAt,
  };
  await repos.competition.matches.create({ ...match });
}

function sentMessages(): string[] {
  return mockCreateNotifications.mock.calls
    .flatMap(([params]) => params as CreateNotificationParams[])
    .map((params) => params.message);
}

beforeEach(() => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  matchCounter = 0;
  vi.clearAllMocks();
  mockInvokeAsync.mockResolvedValue(undefined);
  mockCreateNotification.mockResolvedValue(undefined);
  mockCreateNotifications.mockResolvedValue(undefined);
});

afterEach(() => {
  resetRepositoriesForTesting();
});

describe('division move restarts progression (PRL-04)', () => {
  it('a promoted player starts the new division on a zero streak, keeping their record', async () => {
    const { divisions } = repos.leagueOps;
    const divisionB = await divisions.create({ name: 'Main Event', tier: 1 });
    const divisionA = await divisions.create({ name: 'Midcard', tier: 2 });
    const opponentDivision = await divisions.create({ name: 'Opponents', tier: 3 });
    const player = await repos.roster.players.create({
      name: 'Climber', currentWrestler: 'Climber', divisionId: divisionA.divisionId, divisionJoinedAt: JOINED_AT,
    });
    const opponent = await repos.roster.players.create({
      name: 'Jobber', currentWrestler: 'Jobber', divisionId: opponentDivision.divisionId, divisionJoinedAt: JOINED_AT,
    });
    // The all-time record the move must leave alone.
    await repos.runInTransaction(async (tx) => {
      tx.incrementPlayerRecord(player.playerId, { wins: 5 });
    });

    await repos.progression.putTrack(streakTrack('t-a-promo', 'promotion', divisionA.divisionId, 5));
    await repos.progression.putTrack(streakTrack('t-b-promo', 'promotion', divisionB.divisionId, 5));
    for (let day = 1; day <= 5; day += 1) {
      await addWin(player.playerId, opponent.playerId, `2026-03-0${day}T00:00:00.000Z`);
    }

    await recomputeProgression({ playerIds: [player.playerId] });
    const before = await repos.progression.getPlayerProgression(player.playerId, 't-a-promo');
    expect(before?.goals[0].current).toBe(5);

    const outcome = await executeProgressionMove({
      playerId: player.playerId,
      trackId: 't-a-promo',
      actorUserId: 'sub-gm',
      createdBy: 'gm',
    });
    expect(outcome.ok).toBe(true);

    await recomputeProgression({ playerIds: [player.playerId] });
    const moved = await repos.roster.players.findById(player.playerId);
    expect(moved?.divisionId).toBe(divisionB.divisionId);
    expect(moved?.progressionEpochAt).toBe(moved?.divisionJoinedAt);
    expect(moved?.wins).toBe(5);
    expect(await repos.progression.getPlayerProgression(player.playerId, 't-a-promo')).toBeNull();
    const fresh = await repos.progression.getPlayerProgression(player.playerId, 't-b-promo');
    expect(fresh?.goals[0].current).toBe(0);

    await addWin(player.playerId, opponent.playerId, new Date(Date.now() + 60_000).toISOString());
    await recomputeProgression({ playerIds: [player.playerId] });
    const afterWin = await repos.progression.getPlayerProgression(player.playerId, 't-b-promo');
    expect(afterWin?.goals[0].current).toBe(1);
    expect((await repos.roster.players.findById(player.playerId))?.wins).toBe(5);
  });

  it('moving back to a previous division notifies milestones again', async () => {
    const player = await repos.roster.players.create({
      name: 'Returner', currentWrestler: 'Returner', divisionId: 'div-dojo', divisionJoinedAt: JOINED_AT,
    });
    await repos.roster.players.update(player.playerId, { userId: 'user-returner' });
    const opponent = await repos.roster.players.create({
      name: 'Opponent', currentWrestler: 'Opponent', divisionId: 'div-other', divisionJoinedAt: JOINED_AT,
    });
    await repos.progression.putTrack(streakTrack('t-dojo', 'callup', 'div-dojo', 4));
    const recompute = () => recomputeProgression({ playerIds: [player.playerId] });
    const moveTo = async (divisionId: string, at: string): Promise<void> => {
      await repos.roster.players.update(player.playerId, { divisionId, ...divisionMovePatch(at) });
      await recompute();
    };

    // First stint: baseline, then 50% is announced once.
    await recompute();
    await addWin(player.playerId, opponent.playerId, '2026-02-01T00:00:00.000Z');
    await addWin(player.playerId, opponent.playerId, '2026-02-02T00:00:00.000Z');
    await recompute();
    expect(sentMessages()).toEqual(["You're 50% of the way there on t-dojo!"]);
    const firstStint = await repos.progression.getPlayerProgression(player.playerId, 't-dojo');
    expect(firstStint?.notifiedThresholds).toEqual([50]);

    // Out and back: the old row (and its dedupe) is dropped on the way out.
    await moveTo('div-main', '2026-03-01T00:00:00.000Z');
    expect(await repos.progression.getPlayerProgression(player.playerId, 't-dojo')).toBeNull();
    await moveTo('div-dojo', '2026-04-01T00:00:00.000Z');
    const restarted = await repos.progression.getPlayerProgression(player.playerId, 't-dojo');
    expect(restarted?.goals[0].current).toBe(0);
    expect(restarted?.notifiedThresholds ?? []).toEqual([]);

    // Second stint: the same milestone is announced again.
    await addWin(player.playerId, opponent.playerId, '2026-04-02T00:00:00.000Z');
    await addWin(player.playerId, opponent.playerId, '2026-04-03T00:00:00.000Z');
    await recompute();
    expect(sentMessages()).toEqual([
      "You're 50% of the way there on t-dojo!",
      "You're 50% of the way there on t-dojo!",
    ]);
  });
});
