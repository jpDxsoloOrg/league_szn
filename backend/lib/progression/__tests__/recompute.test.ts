import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildInMemoryRepositories } from '../../repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../repositories';
import type { Match, Player, ProgressionTrack } from '../../repositories/types';
import { recomputeProgression, PER_PLAYER_LOADER_MAX, SYSTEM_ACTOR } from '../recompute';
import * as loadInputs from '../loadInputs';

let repos: Repositories;

const NOW = '2026-06-01T00:00:00.000Z';

function track(trackId: string, fromDivisionId: string, partial: Partial<ProgressionTrack> = {}): ProgressionTrack {
  return {
    trackId,
    kind: 'callup',
    name: trackId,
    fromDivisionId,
    toDivisionId: 'div-main',
    goals: [{ goalId: 'g-wins', metric: 'wins', threshold: 4, weight: 1 }],
    windowMode: 'allTime',
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}

async function addPlayer(name: string, divisionId?: string): Promise<Player> {
  return repos.roster.players.create({ name, currentWrestler: name, ...(divisionId ? { divisionId } : {}) });
}

async function addWin(winnerId: string, loserId: string, matchId: string): Promise<void> {
  const match: Match = {
    matchId,
    date: '2026-03-01T00:00:00.000Z',
    participants: [winnerId, loserId],
    winners: [winnerId],
    losers: [loserId],
    status: 'completed',
    createdAt: '2026-03-01T00:00:00.000Z',
  };
  await repos.competition.matches.create({ ...match });
}

const consideration = { status: 'considering' as const, markedBy: 'admin-1', markedAt: NOW, note: 'ready soon' };

describe('recomputeProgression', () => {
  beforeEach(() => {
    repos = buildInMemoryRepositories();
    setRepositoriesForTesting(repos);
  });

  afterEach(() => {
    resetRepositoriesForTesting();
    vi.restoreAllMocks();
  });

  it('scores only active tracks from the player\'s division and reports before/after', async () => {
    const youngBoy = await addPlayer('Young Boy', 'div-dojo');
    const other = await addPlayer('Other', 'div-main');
    await repos.progression.putTrack(track('t-dojo', 'div-dojo'));
    await repos.progression.putTrack(track('t-main', 'div-main'));
    await repos.progression.putTrack(track('t-dojo-off', 'div-dojo', { isActive: false }));
    await addWin(youngBoy.playerId, other.playerId, 'm1');

    const result = await recomputeProgression({ playerIds: [youngBoy.playerId] });

    expect(result.playersProcessed).toBe(1);
    expect(result.failures).toEqual([]);
    expect(result.changes).toHaveLength(1);
    const [change] = result.changes;
    expect(change.playerId).toBe(youngBoy.playerId);
    expect(change.trackId).toBe('t-dojo');
    expect(change.before).toBeUndefined();
    expect(change.after.progressPct).toBe(25);
    expect(change.after.goals).toEqual([{ goalId: 'g-wins', current: 1, threshold: 4, met: false }]);

    expect(await repos.progression.getPlayerProgression(youngBoy.playerId, 't-dojo')).toMatchObject({ progressPct: 25 });
    expect(await repos.progression.listByPlayer(youngBoy.playerId)).toHaveLength(1);
    // Players not asked for are untouched.
    expect(await repos.progression.listByPlayer(other.playerId)).toEqual([]);
  });

  it('keeps an existing consideration and exposes the old row as `before`', async () => {
    const youngBoy = await addPlayer('Young Boy', 'div-dojo');
    const other = await addPlayer('Other', 'div-dojo');
    await repos.progression.putTrack(track('t-dojo', 'div-dojo'));
    await repos.progression.upsertPlayerProgression({
      playerId: youngBoy.playerId, trackId: 't-dojo', progressPct: 0, goals: [], computedAt: '2026-01-01T00:00:00.000Z',
    });
    await repos.progression.setConsideration(youngBoy.playerId, 't-dojo', consideration);
    await addWin(youngBoy.playerId, other.playerId, 'm1');
    await addWin(youngBoy.playerId, other.playerId, 'm2');

    const result = await recomputeProgression({ playerIds: [youngBoy.playerId] });

    const change = result.changes.find((c) => c.playerId === youngBoy.playerId);
    expect(change?.before).toMatchObject({ progressPct: 0, consideration });
    expect(change?.after).toMatchObject({ progressPct: 50, consideration });
    const stored = await repos.progression.getPlayerProgression(youngBoy.playerId, 't-dojo');
    expect(stored?.consideration).toEqual(consideration);
    expect(stored?.progressPct).toBe(50);
  });

  it('drops rows for tracks of a division the player left, logging a removed consideration', async () => {
    const player = await addPlayer('Mover', 'div-dojo');
    await repos.progression.putTrack(track('t-dojo', 'div-dojo'));
    await repos.progression.putTrack(track('t-dojo-2', 'div-dojo', { kind: 'promotion' }));
    await repos.progression.putTrack(track('t-main', 'div-main', { kind: 'relegation', toDivisionId: 'div-dojo' }));
    for (const trackId of ['t-dojo', 't-dojo-2']) {
      await repos.progression.upsertPlayerProgression({
        playerId: player.playerId, trackId, progressPct: 10, goals: [], computedAt: NOW,
      });
    }
    await repos.progression.setConsideration(player.playerId, 't-dojo', consideration);
    await repos.roster.players.update(player.playerId, { divisionId: 'div-main' });

    const result = await recomputeProgression({ playerIds: [player.playerId] });

    expect(result.dropped.map((d) => [d.trackId, d.reason]).sort()).toEqual([
      ['t-dojo', 'divisionChanged'],
      ['t-dojo-2', 'divisionChanged'],
    ]);
    expect(result.dropped.find((d) => d.trackId === 't-dojo')?.row.consideration).toEqual(consideration);
    const rows = await repos.progression.listByPlayer(player.playerId);
    expect(rows.map((r) => r.trackId)).toEqual(['t-main']);

    const events = await repos.progression.listEvents(player.playerId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      trackId: 't-dojo',
      type: 'consideration_removed',
      kind: 'callup',
      fromDivisionId: 'div-dojo',
      actorUserId: SYSTEM_ACTOR,
    });
  });

  it('drops every row when the player has no division', async () => {
    const player = await addPlayer('Free agent');
    await repos.progression.putTrack(track('t-dojo', 'div-dojo'));
    await repos.progression.upsertPlayerProgression({
      playerId: player.playerId, trackId: 't-dojo', progressPct: 10, goals: [], computedAt: NOW,
    });

    const result = await recomputeProgression({ playerIds: [player.playerId] });

    expect(result.dropped).toHaveLength(1);
    expect(await repos.progression.listByPlayer(player.playerId)).toEqual([]);
  });

  it('drops rows whose track no longer exists', async () => {
    const player = await addPlayer('Young Boy', 'div-dojo');
    await repos.progression.upsertPlayerProgression({
      playerId: player.playerId, trackId: 't-gone', progressPct: 10, goals: [], computedAt: NOW,
    });

    const result = await recomputeProgression({ playerIds: [player.playerId] });

    expect(result.dropped).toEqual([expect.objectContaining({ trackId: 't-gone', reason: 'trackMissing' })]);
    expect(await repos.progression.listByPlayer(player.playerId)).toEqual([]);
  });

  it('leaves a row on an inactive track of the same division frozen', async () => {
    const player = await addPlayer('Young Boy', 'div-dojo');
    await repos.progression.putTrack(track('t-paused', 'div-dojo', { isActive: false }));
    await repos.progression.upsertPlayerProgression({
      playerId: player.playerId, trackId: 't-paused', progressPct: 42, goals: [], computedAt: NOW,
    });
    await repos.progression.setConsideration(player.playerId, 't-paused', consideration);

    const result = await recomputeProgression({ playerIds: [player.playerId] });

    expect(result.changes).toEqual([]);
    expect(result.dropped).toEqual([]);
    expect(await repos.progression.getPlayerProgression(player.playerId, 't-paused')).toMatchObject({
      progressPct: 42, consideration,
    });
  });

  it('skips unknown players without failing', async () => {
    await repos.progression.putTrack(track('t-dojo', 'div-dojo'));
    const result = await recomputeProgression({ playerIds: ['missing'] });
    expect(result).toEqual({
      playersProcessed: 0,
      changes: [],
      dropped: [],
      failures: [],
      milestones: { rowsAnnounced: 0, notificationsSent: 0, failures: [] },
    });
  });

  it('records a bad track as a failure and still scores the others', async () => {
    const player = await addPlayer('Young Boy', 'div-dojo');
    await repos.progression.putTrack(track('t-bad', 'div-dojo', {
      goals: [{ goalId: 'g', metric: 'wins', threshold: -1, weight: 1 }],
    }));
    await repos.progression.putTrack(track('t-good', 'div-dojo'));

    const result = await recomputeProgression({ playerIds: [player.playerId] });

    expect(result.failures).toEqual([expect.objectContaining({ playerId: player.playerId, trackId: 't-bad' })]);
    expect(result.changes.map((c) => c.trackId)).toEqual(['t-good']);
  });

  it('uses the per-player loader for a few players and the batch loader for recompute-all', async () => {
    const perPlayer = vi.spyOn(loadInputs, 'loadProgressionForPlayers');
    const batch = vi.spyOn(loadInputs, 'loadProgressionBatch');
    const a = await addPlayer('A', 'div-dojo');
    const b = await addPlayer('B', 'div-dojo');
    await addPlayer('C', 'div-main');
    await repos.progression.putTrack(track('t-dojo', 'div-dojo'));

    await recomputeProgression({ playerIds: [a.playerId, a.playerId] });
    expect(perPlayer).toHaveBeenCalledWith([a.playerId]);
    expect(batch).not.toHaveBeenCalled();

    const all = await recomputeProgression({ all: true });
    expect(batch).toHaveBeenCalledTimes(1);
    expect(all.playersProcessed).toBe(3);
    expect(all.changes.map((c) => c.playerId).sort()).toEqual([a.playerId, b.playerId].sort());
    expect(PER_PLAYER_LOADER_MAX).toBeGreaterThan(1);
  });

  it('recompute-all drops stale rows found through the track index', async () => {
    const player = await addPlayer('Mover', 'div-main');
    await repos.progression.putTrack(track('t-dojo', 'div-dojo'));
    await repos.progression.upsertPlayerProgression({
      playerId: player.playerId, trackId: 't-dojo', progressPct: 10, goals: [], computedAt: NOW,
    });

    const result = await recomputeProgression({ all: true });

    expect(result.dropped).toEqual([expect.objectContaining({ playerId: player.playerId, trackId: 't-dojo' })]);
    expect(await repos.progression.listByPlayer(player.playerId)).toEqual([]);
  });

  it('does nothing for an empty request', async () => {
    const result = await recomputeProgression({ playerIds: [] });
    expect(result).toEqual({
      playersProcessed: 0,
      changes: [],
      dropped: [],
      failures: [],
      milestones: { rowsAnnounced: 0, notificationsSent: 0, failures: [] },
    });
  });
});

describe('loadProgressionForPlayers', () => {
  beforeEach(() => {
    repos = buildInMemoryRepositories();
    setRepositoriesForTesting(repos);
  });

  afterEach(() => {
    resetRepositoriesForTesting();
  });

  it('matches what the batch loader produces for the same players', async () => {
    const alice = await repos.roster.players.update(
      (await addPlayer('Alice', 'div-dojo')).playerId, { userId: 'user-alice' },
    );
    const bob = await addPlayer('Bob', 'div-dojo');
    await addWin(alice.playerId, bob.playerId, 'm1');
    const promo = await repos.content.promos.create({ playerId: alice.playerId, promoType: 'open-mic', content: 'hi' });
    await repos.content.promos.addReaction(promo.promoId, 'user-alice', 'fire');
    await repos.content.promos.addReaction(promo.promoId, 'user-bob', 'fire');
    const hidden = await repos.content.promos.create({ playerId: alice.playerId, promoType: 'open-mic', content: 'x' });
    await repos.content.promos.update(hidden.promoId, { isHidden: true });
    const expiresAt = '2027-01-01T00:00:00.000Z';
    await repos.user.challenges.create({ challengerId: alice.playerId, challengedId: bob.playerId, matchType: 'singles', expiresAt });
    const cancelled = await repos.user.challenges.create({ challengerId: alice.playerId, challengedId: bob.playerId, matchType: 'singles', expiresAt });
    await repos.user.challenges.update(cancelled.challengeId, { status: 'cancelled' });

    const ids = [alice.playerId, bob.playerId, 'missing'];
    const perPlayer = await loadInputs.loadProgressionForPlayers(ids);
    const batch = await loadInputs.loadProgressionBatch(ids);

    expect(perPlayer.inputs).toEqual(batch.inputs);
    expect([...perPlayer.players.keys()].sort()).toEqual([...batch.players.keys()].sort());
    expect(perPlayer.inputs.get(alice.playerId)?.promos).toEqual([
      expect.objectContaining({ reactionCounts: { fire: 1 } }),
    ]);
    expect(perPlayer.inputs.get(alice.playerId)?.challenges).toHaveLength(1);
  });
});
