import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockInvokeAsync } = vi.hoisted(() => ({ mockInvokeAsync: vi.fn() }));
vi.mock('../../asyncLambda', () => ({ invokeAsync: mockInvokeAsync }));

import { buildInMemoryRepositories } from '../../repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
  type Rivalry,
} from '../../repositories';
import type { Division, Match, ProgressionTrack } from '../../repositories/types';
import { computeProgress } from '../../policies/progression';
import {
  contenderRanksForPlayer,
  hotAngleRivalryIds,
  loadProgressionBatch,
  loadProgressionForPlayers,
} from '../loadInputs';
import { buildDefaultLadderTrack, DEFAULT_PROMOTION_GOALS, DEFAULT_RELEGATION_GOALS } from '../defaultTracks';
import { ensureDefaultLadderTracks, planDefaultLadderTracks } from '../ladderTemplates';
import { recomputeProgression } from '../recompute';
import { createDivision, updateDivision } from '../../divisions';

let repos: Repositories;
const NOW = '2026-06-01T00:00:00.000Z';

function division(divisionId: string, partial: Partial<Division> = {}): Division {
  return { divisionId, name: divisionId, createdAt: NOW, updatedAt: NOW, ...partial };
}

function rivalry(rivalryId: string, partial: Partial<Rivalry>): Rivalry {
  return {
    rivalryId,
    title: rivalryId,
    status: 'active',
    heat: 'warm',
    heatScore: 0,
    participants: [],
    requestedBy: 'u',
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}

async function addLoss(winnerId: string, loserId: string, matchId: string, day: number, rivalryId?: string): Promise<void> {
  const date = new Date(Date.UTC(2026, 4, day)).toISOString();
  const match: Match = {
    matchId,
    date,
    participants: [winnerId, loserId],
    winners: [winnerId],
    losers: [loserId],
    status: 'completed',
    createdAt: date,
    ...(rivalryId ? { rivalryId } : {}),
  };
  await repos.competition.matches.create({ ...match });
}

async function makeRivalry(heat: Rivalry['heat'], status: Rivalry['status'], playerIds: string[]): Promise<string> {
  const created = await repos.rivalries.create({
    title: `${heat} feud`,
    participants: playerIds.map((playerId) => ({ playerId })),
    requestedBy: 'user-gm',
  });
  await repos.rivalries.update(created.rivalryId, { status, heat });
  return created.rivalryId;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInvokeAsync.mockResolvedValue(undefined);
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.restoreAllMocks();
});

describe('hotAngleRivalryIds', () => {
  it('keeps active rivalries at hot or scorching heat only', () => {
    const ids = hotAngleRivalryIds([
      rivalry('hot', { heat: 'hot' }),
      rivalry('scorching', { heat: 'scorching' }),
      rivalry('warm', { heat: 'warm' }),
      rivalry('hot-but-over', { heat: 'hot', status: 'completed' }),
    ]);
    expect([...ids].sort()).toEqual(['hot', 'scorching']);
  });
});

describe('contenderRanksForPlayer', () => {
  it('reads ranks on active titles of the player division, skipping tag rows', () => {
    const titles = [
      { championshipId: 'raw-title', name: 'R', type: 'singles' as const, divisionId: 'raw', createdAt: NOW, updatedAt: NOW },
      { championshipId: 'old-title', name: 'O', type: 'singles' as const, divisionId: 'raw', isActive: false, createdAt: NOW, updatedAt: NOW },
      { championshipId: 'sd-title', name: 'S', type: 'singles' as const, divisionId: 'sd', createdAt: NOW, updatedAt: NOW },
    ];
    const row = (championshipId: string, rank: number, entityType?: 'tagTeam') => ({
      championshipId, playerId: 'p1', rank, rankingScore: 0, winPercentage: 0, currentStreak: 0,
      matchesInPeriod: 0, winsInPeriod: 0, calculatedAt: NOW, updatedAt: NOW, ...(entityType ? { entityType } : {}),
    });
    const ranks = contenderRanksForPlayer(
      { playerId: 'p1', divisionId: 'raw' },
      titles,
      [row('raw-title', 4), row('old-title', 1), row('sd-title', 1), row('raw-title', 2, 'tagTeam')],
    );
    expect(ranks).toEqual([4]);
  });
});

describe('loader tags hot-angle matches (house rule)', () => {
  it('tags matches of an active hot rivalry and nothing else', async () => {
    const loser = await repos.roster.players.create({ name: 'L', currentWrestler: 'L' });
    const winner = await repos.roster.players.create({ name: 'W', currentWrestler: 'W' });
    const hot = await makeRivalry('hot', 'active', [loser.playerId, winner.playerId]);
    const cold = await makeRivalry('cold', 'active', [loser.playerId, winner.playerId]);
    const ended = await makeRivalry('scorching', 'completed', [loser.playerId, winner.playerId]);
    await addLoss(winner.playerId, loser.playerId, 'm-hot', 1, hot);
    await addLoss(winner.playerId, loser.playerId, 'm-cold', 2, cold);
    await addLoss(winner.playerId, loser.playerId, 'm-ended', 3, ended);
    await addLoss(winner.playerId, loser.playerId, 'm-none', 4);

    for (const load of [loadProgressionBatch, loadProgressionForPlayers]) {
      const { inputs } = await load([loser.playerId]);
      const tags = Object.fromEntries(
        (inputs.get(loser.playerId)?.matches ?? []).map((match) => [match.matchId, match.isHotAngle === true]),
      );
      expect(tags).toEqual({ 'm-hot': true, 'm-cold': false, 'm-ended': false, 'm-none': false });
    }
  });

  it('a player on a losing streak in a hot rivalry shows no increase in relegation danger', async () => {
    const victim = await repos.roster.players.create({ name: 'V', currentWrestler: 'V' });
    const rival = await repos.roster.players.create({ name: 'R', currentWrestler: 'R' });
    const hot = await makeRivalry('hot', 'active', [victim.playerId, rival.playerId]);
    const track = buildDefaultLadderTrack({ trackId: 'rel', kind: 'relegation', fromDivisionId: 'raw', divisionName: 'Raw', now: NOW });
    track.goals.push({ goalId: 'streak', metric: 'currentLossStreak', threshold: 3, weight: 1 });

    const danger = async () => {
      const { inputs } = await loadProgressionBatch([victim.playerId]);
      const victimInputs = inputs.get(victim.playerId);
      if (!victimInputs) throw new Error('missing inputs');
      return computeProgress(track, victimInputs);
    };

    for (let day = 1; day <= 8; day++) await addLoss(victim.playerId, rival.playerId, `w${day}`, day);
    const before = await danger();

    for (let day = 9; day <= 18; day++) await addLoss(rival.playerId, victim.playerId, `l${day}`, day, hot);
    const after = await danger();

    expect(after.progressPct).toBeLessThanOrEqual(before.progressPct);
    const goal = (result: typeof before, goalId: string) => result.goals.find((status) => status.goalId === goalId)?.current;
    expect(goal(after, 'loss-pct')).toBe(0);
    expect(goal(after, 'streak')).toBe(0);
  });
});

describe('default ladder templates', () => {
  const ladder = [
    division('raw', { name: 'Raw', tier: 1 }),
    division('sd', { name: 'SmackDown', tier: 1 }),
    division('nxt', { name: 'NXT', tier: 2 }),
    division('yb', { name: 'Young Boys', isDevelopmental: true }),
    division('legends', { name: 'Legends' }),
  ];
  let seq = 0;
  const ids = () => `t${++seq}`;

  it('plans promotion where something ranks above and relegation where something ranks below', () => {
    const planned = planDefaultLadderTracks(ladder, [], NOW, ids);
    const keys = planned.map((track) => `${track.kind}:${track.fromDivisionId}`).sort();
    expect(keys).toEqual(['promotion:nxt', 'relegation:nxt', 'relegation:raw', 'relegation:sd']);
    const nxtPromotion = planned.find((track) => track.kind === 'promotion');
    expect(nxtPromotion).toMatchObject({ name: 'NXT Promotion', isActive: true, windowMode: 'sinceJoinedDivision' });
    expect(nxtPromotion?.toDivisionId).toBeUndefined();
    expect(nxtPromotion?.goals).toEqual(DEFAULT_PROMOTION_GOALS);
    expect(planned.find((track) => track.kind === 'relegation')?.goals).toEqual(DEFAULT_RELEGATION_GOALS);
  });

  it('skips divisions that already have a track of that kind, even an inactive one', () => {
    const existing: ProgressionTrack = {
      ...buildDefaultLadderTrack({ trackId: 'x', kind: 'relegation', fromDivisionId: 'raw', divisionName: 'Raw', now: NOW }),
      isActive: false,
      goals: [{ goalId: 'custom', metric: 'lossPct', threshold: 90, weight: 1 }],
    };
    const keys = planDefaultLadderTracks(ladder, [existing], NOW, ids).map((track) => `${track.kind}:${track.fromDivisionId}`);
    expect(keys).not.toContain('relegation:raw');
    expect(keys).toContain('relegation:sd');
  });

  it('is created when a tier is set, idempotently, and queues one recompute', async () => {
    const top = await createDivision({ name: 'Raw', tier: 1 });
    // Only one rung so far: nothing to promote to or relegate to.
    expect(await repos.progression.listTracks()).toHaveLength(0);

    const lower = await createDivision({ name: 'NXT' });
    await repos.roster.players.create({ name: 'P', currentWrestler: 'P', divisionId: lower.divisionId });
    await updateDivision(lower.divisionId, { tier: 2 });

    const tracks = await repos.progression.listTracks();
    expect(tracks.map((track) => `${track.kind}:${track.fromDivisionId}`).sort()).toEqual(
      [`promotion:${lower.divisionId}`, `relegation:${top.divisionId}`].sort(),
    );
    expect(mockInvokeAsync).toHaveBeenCalledTimes(1);
    expect(mockInvokeAsync.mock.calls[0][0]).toBe('progression');

    await updateDivision(lower.divisionId, { tier: 2, name: 'NXT 2.0' });
    expect(await ensureDefaultLadderTracks()).toEqual([]);
    expect(await repos.progression.listTracks()).toHaveLength(2);
  });

  it('does nothing when the update does not set a tier', async () => {
    await repos.leagueOps.divisions.create({ name: 'Raw', tier: 1 });
    const lower = await repos.leagueOps.divisions.create({ name: 'NXT', tier: 2 });
    await updateDivision(lower.divisionId, { name: 'NXT UK' });
    expect(await repos.progression.listTracks()).toHaveLength(0);
  });
});

describe('recompute with ladder tracks', () => {
  it('scores both the promotion and the relegation track of the player division', async () => {
    const top = await repos.leagueOps.divisions.create({ name: 'Raw', tier: 1 });
    const mid = await repos.leagueOps.divisions.create({ name: 'NXT', tier: 2 });
    await repos.leagueOps.divisions.create({ name: 'Young Boys', isDevelopmental: true });
    const player = await repos.roster.players.create({ name: 'P', currentWrestler: 'P', divisionId: mid.divisionId });

    const created = await ensureDefaultLadderTracks();
    expect(created.map((track) => `${track.kind}:${track.fromDivisionId}`).sort()).toEqual(
      [`promotion:${mid.divisionId}`, `relegation:${mid.divisionId}`, `relegation:${top.divisionId}`].sort(),
    );

    const result = await recomputeProgression({ playerIds: [player.playerId] });
    expect(result.failures).toEqual([]);
    const rows = await repos.progression.listByPlayer(player.playerId);
    const kinds = rows
      .map((row) => created.find((track) => track.trackId === row.trackId)?.kind)
      .sort();
    expect(kinds).toEqual(['promotion', 'relegation']);
  });
});
