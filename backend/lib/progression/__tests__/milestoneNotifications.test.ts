import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockCreateNotifications, mockListStaffUserIds } = vi.hoisted(() => ({
  mockCreateNotifications: vi.fn(),
  mockListStaffUserIds: vi.fn(),
}));

vi.mock('../../notifications', () => ({ createNotifications: mockCreateNotifications }));
vi.mock('../../staffUsers', () => ({ listStaffUserIds: mockListStaffUserIds }));

import { buildInMemoryRepositories } from '../../repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../repositories';
import type { CreateNotificationParams } from '../../notifications';
import type { Match, Player, ProgressionTrack } from '../../repositories/types';
import { recomputeProgression } from '../recompute';

let repos: Repositories;
let matchCounter = 0;

const NOW = '2026-06-01T00:00:00.000Z';

function track(partial: Partial<ProgressionTrack> = {}): ProgressionTrack {
  return {
    trackId: 't-dojo',
    kind: 'callup',
    name: 'Dojo Call-Up',
    fromDivisionId: 'div-dojo',
    toDivisionId: 'div-main',
    goals: [{ goalId: 'g-wins', metric: 'wins', threshold: 4, weight: 1 }],
    windowMode: 'allTime',
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}

async function addPlayer(name: string, divisionId: string, userId?: string): Promise<Player> {
  const player = await repos.roster.players.create({ name, currentWrestler: name, divisionId });
  if (!userId) return player;
  return repos.roster.players.update(player.playerId, { userId });
}

async function addResult(winnerId: string, loserId: string): Promise<void> {
  matchCounter += 1;
  const match: Match = {
    matchId: `m${matchCounter}`,
    date: `2026-03-${String(matchCounter).padStart(2, '0')}T00:00:00.000Z`,
    participants: [winnerId, loserId],
    winners: [winnerId],
    losers: [loserId],
    status: 'completed',
    createdAt: NOW,
  };
  await repos.competition.matches.create({ ...match });
}

/** Every notification param sent so far, flattened across calls. */
function sent(): CreateNotificationParams[] {
  return mockCreateNotifications.mock.calls.flatMap(([params]) => params as CreateNotificationParams[]);
}

describe('progression milestone notifications', () => {
  let youngBoy: Player;
  let opponent: Player;

  beforeEach(async () => {
    repos = buildInMemoryRepositories();
    setRepositoriesForTesting(repos);
    matchCounter = 0;
    mockCreateNotifications.mockReset();
    mockListStaffUserIds.mockReset();
    mockListStaffUserIds.mockResolvedValue(['gm-admin', 'gm-mod']);
    youngBoy = await addPlayer('Young Boy', 'div-dojo', 'user-yb');
    opponent = await addPlayer('Opponent', 'div-main');
  });

  afterEach(() => {
    resetRepositoriesForTesting();
  });

  const recompute = () => recomputeProgression({ playerIds: [youngBoy.playerId] });

  it('treats the first computation as a baseline and sends nothing', async () => {
    await repos.progression.putTrack(track());
    await addResult(youngBoy.playerId, opponent.playerId);
    await addResult(youngBoy.playerId, opponent.playerId);

    await recompute(); // new row at 50%

    expect(mockCreateNotifications).not.toHaveBeenCalled();
    const row = await repos.progression.getPlayerProgression(youngBoy.playerId, 't-dojo');
    expect(row?.notifiedThresholds).toEqual([50]);
    expect(row?.notifiedGoalIds).toEqual([]);
  });

  it('fires each threshold exactly once', async () => {
    await repos.progression.putTrack(track());
    await addResult(youngBoy.playerId, opponent.playerId);
    await recompute(); // baseline at 25%

    await addResult(youngBoy.playerId, opponent.playerId);
    await recompute(); // 50%
    expect(sent()).toEqual([
      {
        userId: 'user-yb',
        type: 'progression_milestone',
        message: "You're 50% of the way there on Dojo Call-Up!",
        sourceId: youngBoy.playerId,
        sourceType: 'progression',
      },
    ]);

    await recompute(); // still 50%: nothing new
    await recomputeProgression({ all: true }); // recompute-all: nothing new either
    expect(sent()).toHaveLength(1);

    await addResult(youngBoy.playerId, opponent.playerId);
    await recompute(); // 75%
    expect(sent()).toHaveLength(2);
    expect(sent()[1].message).toBe("You're 75% of the way there on Dojo Call-Up!");
    expect(mockListStaffUserIds).not.toHaveBeenCalled();
  });

  it('fans out to every GM only when a player reaches 100%', async () => {
    await repos.progression.putTrack(track());
    await addResult(youngBoy.playerId, opponent.playerId);
    await recompute(); // baseline at 25%

    for (let i = 0; i < 3; i += 1) await addResult(youngBoy.playerId, opponent.playerId);
    const result = await recompute(); // 100%, goal met

    expect(mockListStaffUserIds).toHaveBeenCalledTimes(1);
    const params = sent();
    expect(params).toHaveLength(3);
    expect(params[0]).toMatchObject({
      userId: 'user-yb',
      message: "You've completed every call-up goal on Dojo Call-Up!",
    });
    expect(params.slice(1)).toEqual(
      ['gm-admin', 'gm-mod'].map((userId) => ({
        userId,
        type: 'progression_milestone',
        message: 'Young Boy has completed all call-up goals on Dojo Call-Up.',
        sourceId: youngBoy.playerId,
        sourceType: 'progression',
      })),
    );
    expect(result.milestones).toEqual({ rowsAnnounced: 1, notificationsSent: 3, failures: [] });

    await recompute();
    expect(sent()).toHaveLength(3);
  });

  it('announces a newly met goal', async () => {
    await repos.progression.putTrack(
      track({
        goals: [
          { goalId: 'g-wins', metric: 'wins', threshold: 1, weight: 1 },
          { goalId: 'g-matches', metric: 'matchesCompeted', threshold: 10, weight: 9 },
        ],
      }),
    );
    await recompute(); // baseline at 0%

    await addResult(youngBoy.playerId, opponent.playerId);
    await recompute(); // g-wins met, progress 19%

    expect(sent()).toEqual([
      expect.objectContaining({ userId: 'user-yb', message: 'Goal complete on Dojo Call-Up: 1 win.' }),
    ]);
  });

  it('sends nothing when progress drops, and nothing when it climbs back over a notified threshold', async () => {
    await repos.progression.putTrack(
      track({
        goals: [
          { goalId: 'g-wins', metric: 'wins', threshold: 2, weight: 1 },
          { goalId: 'g-winpct', metric: 'winPct', threshold: 100, weight: 1 },
        ],
      }),
    );
    await addResult(opponent.playerId, youngBoy.playerId);
    await recompute(); // baseline at 0%

    await addResult(youngBoy.playerId, opponent.playerId);
    await recompute(); // wins 1/2, winPct 50 => 50%
    expect(sent()).toHaveLength(1);
    expect(sent()[0].message).toContain('50%');

    await addResult(opponent.playerId, youngBoy.playerId);
    const dropped = await recompute(); // winPct 33 => below 50%
    expect(dropped.changes[0].after.progressPct).toBeLessThan(50);
    expect(sent()).toHaveLength(1);

    await addResult(youngBoy.playerId, opponent.playerId);
    await recompute(); // wins 2/2 (met), winPct 50 => 75%; 50% is not repeated
    expect(sent()).toHaveLength(2);
    expect(sent()[1].message).toBe(
      "Goal complete on Dojo Call-Up: 2 wins. You're 75% of the way there on Dojo Call-Up!",
    );
  });

  it('never notifies on a relegation track', async () => {
    await repos.progression.putTrack(track({ kind: 'relegation', toDivisionId: undefined }));
    await recompute();
    for (let i = 0; i < 4; i += 1) await addResult(youngBoy.playerId, opponent.playerId);
    await recompute();
    expect(mockCreateNotifications).not.toHaveBeenCalled();
  });

  it('notifies GMs even when the player has no linked account', async () => {
    const unlinked = await addPlayer('Unlinked', 'div-dojo');
    await repos.progression.putTrack(track());
    await recomputeProgression({ playerIds: [unlinked.playerId] }); // baseline at 0%
    for (let i = 0; i < 4; i += 1) await addResult(unlinked.playerId, opponent.playerId);
    await recomputeProgression({ playerIds: [unlinked.playerId] });

    expect(sent().map((param) => param.userId)).toEqual(['gm-admin', 'gm-mod']);
  });

  it('does not notify when another recompute already recorded the milestone', async () => {
    await repos.progression.putTrack(track());
    await addResult(youngBoy.playerId, opponent.playerId);
    await recompute(); // baseline at 25%
    await addResult(youngBoy.playerId, opponent.playerId);

    // A concurrent run wins the optimistic write first.
    const recordSpy = vi
      .spyOn(repos.progression, 'recordNotifiedMilestones')
      .mockResolvedValueOnce(false);
    await recompute();

    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(mockCreateNotifications).not.toHaveBeenCalled();
  });
});
