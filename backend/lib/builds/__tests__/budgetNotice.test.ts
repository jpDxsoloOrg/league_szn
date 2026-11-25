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
import type { Division, ProgressionTrack, WrestlerBuild } from '../../repositories/types';
import { executeProgressionMove } from '../../progression/executeMove';
import {
  notifyBuildOverBudgetAfterMove,
  overBudgetAfterMove,
  overBudgetMessage,
} from '../budgetNotice';

/**
 * BLD-04: a move to a smaller budget that leaves the build over it notifies
 * the player once, with neutral copy. Within budget or a promotion: nothing.
 * Budgets (buildRules): tier 1 = 160, tier 2 = 130, other tiers = 100.
 */

const NOW = '2026-06-01T00:00:00.000Z';

/** Stats 75/75/75/55: 35 + 35 + 35 + 15 = 120 points. */
const BUILD_120: WrestlerBuild = {
  style: 'allRounder',
  stats: { strikes: 75, grapple: 75, agility: 75, endurance: 55 },
  updatedAt: NOW,
};
/** Stats 70/60/60/40: 30 + 20 + 20 + 0 = 70 points. */
const BUILD_70: WrestlerBuild = {
  style: 'allRounder',
  stats: { strikes: 70, grapple: 60, agility: 60, endurance: 40 },
  updatedAt: NOW,
};

let repos: Repositories;

function overBudgetNotices(): CreateNotificationParams[] {
  return mockCreateNotification.mock.calls
    .map(([params]) => params as CreateNotificationParams)
    .filter((params) => params.type === 'build_over_budget');
}

function track(trackId: string, kind: ProgressionTrack['kind'], fromDivisionId: string): ProgressionTrack {
  return {
    trackId,
    kind,
    name: trackId,
    fromDivisionId,
    goals: [{ goalId: `${trackId}-wins`, metric: 'currentWinStreak', threshold: 3, weight: 1 }],
    windowMode: 'allTime',
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

async function ladder(): Promise<{ top: Division; mid: Division; low: Division }> {
  const { divisions } = repos.leagueOps;
  const top = await divisions.create({ name: 'Top', tier: 1 });
  const mid = await divisions.create({ name: 'Mid', tier: 2 });
  const low = await divisions.create({ name: 'Low', tier: 3 });
  return { top, mid, low };
}

async function playerIn(divisionId: string, build: WrestlerBuild): Promise<string> {
  const player = await repos.roster.players.create({ name: 'Mover', currentWrestler: 'Mover', divisionId });
  await repos.roster.players.update(player.playerId, { userId: 'user-mover', build });
  return player.playerId;
}

async function moveBetween(
  playerId: string,
  kind: ProgressionTrack['kind'],
  from: Division,
  to: Division,
): Promise<void> {
  await repos.progression.putTrack(track(`t-${kind}`, kind, from.divisionId));
  const outcome = await executeProgressionMove({
    playerId,
    trackId: `t-${kind}`,
    toDivisionId: to.divisionId,
    actorUserId: 'sub-gm',
    createdBy: 'gm',
  });
  expect(outcome.ok).toBe(true);
}

beforeEach(() => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  vi.clearAllMocks();
  mockInvokeAsync.mockResolvedValue(undefined);
  mockCreateNotification.mockResolvedValue(undefined);
  mockCreateNotifications.mockResolvedValue(undefined);
});

afterEach(() => {
  resetRepositoriesForTesting();
});

describe('overBudgetAfterMove', () => {
  const tier2 = { tier: 2 };
  const tier3 = { tier: 3 };

  it('reports how far over the smaller budget the build is', () => {
    expect(overBudgetAfterMove({ build: BUILD_120 }, tier2, tier3)).toEqual({
      cost: 120, previousBudget: 130, budget: 100, overBy: 20,
    });
  });

  it('is null when the build fits the smaller budget', () => {
    expect(overBudgetAfterMove({ build: BUILD_70 }, tier2, tier3)).toBeNull();
  });

  it('is null when the budget grows or stays the same', () => {
    expect(overBudgetAfterMove({ build: BUILD_120 }, tier3, tier2)).toBeNull();
    expect(overBudgetAfterMove({ build: BUILD_120 }, tier3, { tier: 4 })).toBeNull();
  });

  it('counts move levels and treats a lost division as the no-division budget', () => {
    const signatures = [{ gameName: 'Sig', customName: 'Sig', level: 3 }];
    // 70 stat points + 2 signature levels (10) = 80: fits the 80 no-division budget exactly.
    expect(overBudgetAfterMove({ build: BUILD_70, signatures }, tier3, undefined)).toBeNull();
    const finishers = [{ gameName: 'Fin', customName: 'Fin', level: 2 }];
    expect(overBudgetAfterMove({ build: BUILD_70, signatures, finishers }, tier3, null)?.overBy).toBe(8);
  });

  it('never flags a player without a saved build', () => {
    expect(overBudgetAfterMove({}, { tier: 1 }, undefined)).toBeNull();
  });
});

describe('overBudgetMessage', () => {
  it('uses neutral copy with the point count', () => {
    expect(overBudgetMessage(20)).toBe(
      'Your build is over your new budget by 20 points. Re-spend before your next match.',
    );
    expect(overBudgetMessage(1)).toContain('by 1 point.');
    expect(overBudgetMessage(20).toLowerCase()).not.toContain('relegat');
  });
});

describe('division moves (executeProgressionMove)', () => {
  it('a relegation that leaves the build over the new budget notifies once', async () => {
    const { mid, low } = await ladder();
    const playerId = await playerIn(mid.divisionId, BUILD_120);

    await moveBetween(playerId, 'relegation', mid, low);

    expect(overBudgetNotices()).toEqual([
      {
        userId: 'user-mover',
        type: 'build_over_budget',
        message: overBudgetMessage(20),
        sourceId: playerId,
        sourceType: 'build',
      },
    ]);
  });

  it('a relegation that still fits the new budget sends nothing', async () => {
    const { mid, low } = await ladder();
    const playerId = await playerIn(mid.divisionId, BUILD_70);

    await moveBetween(playerId, 'relegation', mid, low);

    expect(overBudgetNotices()).toEqual([]);
  });

  it('a promotion sends nothing, even for a build over the old budget', async () => {
    const { top, low } = await ladder();
    const playerId = await playerIn(low.divisionId, BUILD_120);

    await moveBetween(playerId, 'promotion', low, top);

    expect(overBudgetNotices()).toEqual([]);
  });
});

describe('notifyBuildOverBudgetAfterMove', () => {
  it('looks divisions up by id when the caller has not loaded them', async () => {
    const { mid, low } = await ladder();
    const sent = await notifyBuildOverBudgetAfterMove({
      player: { playerId: 'p1', userId: 'u1', build: BUILD_120 },
      fromDivisionId: mid.divisionId,
      toDivisionId: low.divisionId,
    });
    expect(sent).toBe(true);
    expect(overBudgetNotices()).toHaveLength(1);
  });

  it('skips players without an account and moves that change nothing', async () => {
    const { mid, low } = await ladder();
    expect(await notifyBuildOverBudgetAfterMove({
      player: { playerId: 'p1', build: BUILD_120 },
      fromDivisionId: mid.divisionId,
      toDivisionId: low.divisionId,
    })).toBe(false);
    expect(await notifyBuildOverBudgetAfterMove({
      player: { playerId: 'p1', userId: 'u1', build: BUILD_120 },
      fromDivisionId: low.divisionId,
      toDivisionId: low.divisionId,
    })).toBe(false);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('never throws when the lookup fails', async () => {
    const findById = vi.spyOn(repos.leagueOps.divisions, 'findById').mockRejectedValue(new Error('boom'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(notifyBuildOverBudgetAfterMove({
      player: { playerId: 'p1', userId: 'u1', build: BUILD_120 },
      fromDivisionId: 'a',
      toDivisionId: 'b',
    })).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    findById.mockRestore();
    warn.mockRestore();
  });
});
