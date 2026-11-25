import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, Callback, Context } from 'aws-lambda';

// INJ-04: the result service and deleteMatch against the in-memory store.

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});
vi.mock('../../asyncLambda', () => ({ invokeAsync: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../progression/trigger', () => ({ triggerProgressionRecompute: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../economy/matchPay', () => ({
  settleMatchPay: vi.fn().mockResolvedValue(undefined),
  reverseMatchPay: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../economy/refundSimBoosts', () => ({ refundSimBoosts: vi.fn().mockResolvedValue(0) }));
vi.mock('../../../functions/matches/updateGroupStats', () => ({ updateGroupStats: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../functions/matches/revertGroupStats', () => ({ revertGroupStats: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../notifications', () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }));

import { buildInMemoryRepositories, type InMemoryCompetitionRepository, type InMemoryRosterRepository } from '../../repositories/inMemory';
import { resetRepositoriesForTesting, setRepositoriesForTesting, type Repositories } from '../../repositories';
import { recordMatchResult, RecordMatchResultBadRequestError } from '../../services/recordMatchResult';
import { handler as deleteMatchHandler } from '../../../functions/matches/deleteMatch';
import { createNotification } from '../../notifications';
import { DEFAULT_INJURY_TUNABLES, toInjuryTunablesInput, type InjuryChanceBand } from '../../policies/fatigueDefaults';
import type { Match, Player } from '../../repositories/types';

let repos: Repositories;

const NOW = '2026-11-24T20:00:00.000Z';

function seedPlayer(playerId: string, overrides: Partial<Player> = {}): void {
  (repos.roster as unknown as InMemoryRosterRepository).playersStore.set(playerId, {
    playerId,
    name: playerId,
    currentWrestler: playerId,
    userId: `user-${playerId}`,
    wins: 0,
    losses: 0,
    draws: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Player);
}

function seedMatch(match: Partial<Match> & { matchId: string }): void {
  (repos.competition as unknown as InMemoryCompetitionRepository).matchesStore.set(match.matchId, {
    date: NOW,
    status: 'scheduled',
    participants: ['p1', 'p2'],
    matchFormat: 'singles',
    createdAt: NOW,
    ...match,
  } as Match);
}

async function useTunables(injuryChanceBands: InjuryChanceBand[]): Promise<void> {
  await repos.user.siteConfig.saveInjuryTunables(
    { ...toInjuryTunablesInput(DEFAULT_INJURY_TUNABLES), injuryChanceBands },
    'gm',
  );
}

const ALWAYS: InjuryChanceBand[] = [{ minStamina: 0, chance: 1 }];
const NEVER: InjuryChanceBand[] = [{ minStamina: 0, chance: 0 }];

const player = async (playerId: string) => (await repos.roster.players.findById(playerId))!;
const match = async (matchId: string) => (await repos.competition.matches.findById(matchId))!;

function deleteEvent(matchId: string): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'DELETE',
    isBase64Encoded: false, path: '/', pathParameters: { matchId },
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '',
    requestContext: {
      authorizer: { groups: 'Moderator', principalId: 'sub-1', username: 'gm', email: 'gm@x' },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  await repos.user.siteConfig.updateFeatures({ injuries: true });
  seedPlayer('p1');
  seedPlayer('p2');
});

afterEach(() => resetRepositoriesForTesting());

describe('recording a result drains and rolls (INJ-04)', () => {
  it('drains both players of a manual singles result and stores the report', async () => {
    await useTunables(NEVER);
    seedMatch({ matchId: 'm1' });

    const outcome = await recordMatchResult({ matchId: 'm1', winners: ['p1'], losers: ['p2'] }, { source: 'manual' });

    expect((await player('p1'))).toMatchObject({ wins: 1, stamina: 85 });
    expect((await player('p2'))).toMatchObject({ losses: 1, stamina: 85 });
    const stored = await match('m1');
    expect(stored.tunablesVersion).toBe(1);
    expect(stored.conditionReport).toEqual([
      expect.objectContaining({ playerId: 'p1', staminaBefore: 100, staminaAfter: 85, drain: 15, chance: 0 }),
      expect.objectContaining({ playerId: 'p2', staminaBefore: 100, staminaAfter: 85, drain: 15, chance: 0 }),
    ]);
    expect(outcome.match.conditionReport).toEqual(stored.conditionReport);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('a forced injury writes the player, the history row and the report in the result transaction, then notifies', async () => {
    await useTunables(ALWAYS);
    seedMatch({ matchId: 'm1' });

    await recordMatchResult({ matchId: 'm1', winners: ['p1'], losers: ['p2'] }, { source: 'manual' });

    const loser = await player('p2');
    const [row] = await repos.injuries.listByPlayer('p2');
    expect(row).toMatchObject({ source: 'match', matchId: 'm1', changes: [] });
    expect(loser.currentInjury).toMatchObject({ injuryId: row.injuryId, returnsAt: row.returnsAt });
    expect((await match('m1')).conditionReport?.[1]).toMatchObject({ playerId: 'p2', injuryId: row.injuryId });
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-p2',
      type: 'injury_sustained',
      sourceId: 'm1',
      sourceType: 'match',
    }));
  });

  it('gives an already-injured player no second injury, but still drains them', async () => {
    await useTunables(ALWAYS);
    const storyline = {
      injuryId: 'storyline-1', startedAt: '2026-11-20T00:00:00.000Z', returnsAt: '2099-01-04T05:00:00.000Z',
      severity: 'major' as const, weeks: 4, source: 'storyline' as const,
    };
    seedPlayer('p1', { currentInjury: storyline });
    seedMatch({ matchId: 'm1' });

    await recordMatchResult({ matchId: 'm1', winners: ['p1'], losers: ['p2'] }, { source: 'manual' });

    expect(await player('p1')).toMatchObject({ stamina: 85, currentInjury: storyline });
    expect(await repos.injuries.listByPlayer('p1')).toEqual([]);
    expect((await match('m1')).conditionReport?.[0]).toMatchObject({ playerId: 'p1', alreadyInjured: true });
  });

  it('refuses a re-record without draining or rolling again', async () => {
    await useTunables(ALWAYS);
    seedMatch({ matchId: 'm1' });
    await recordMatchResult({ matchId: 'm1', winners: ['p1'], losers: ['p2'] }, { source: 'manual' });
    const before = { p1: await player('p1'), report: (await match('m1')).conditionReport };

    await expect(recordMatchResult({ matchId: 'm1', winners: ['p2'], losers: ['p1'] }, { source: 'manual' }))
      .rejects.toBeInstanceOf(RecordMatchResultBadRequestError);

    expect((await player('p1')).stamina).toBe(before.p1.stamina);
    expect(await repos.injuries.listByPlayer('p1')).toHaveLength(1);
    expect((await match('m1')).conditionReport).toEqual(before.report);
  });

  it('an official sim result goes through the same path, draining by the sim category', async () => {
    await useTunables(NEVER);
    seedMatch({ matchId: 'm1' });

    await recordMatchResult(
      {
        matchId: 'm1', winners: ['p1'], losers: ['p2'],
        extraMatchFields: { resultSource: 'simulation', simulation: { category: 'hardcore', conditionReport: 'ignored' } },
      },
      { source: 'sim' },
    );

    // hardcore drain 25 × singles 1
    expect(await player('p1')).toMatchObject({ stamina: 75 });
    expect((await match('m1')).conditionReport?.map((entry) => entry.drain)).toEqual([25, 25]);
  });

  it('counts a draw the same and skips a no-show', async () => {
    await useTunables(NEVER);
    seedPlayer('p3');
    seedMatch({ matchId: 'm1', matchFormat: 'Triple Threat', participants: ['p1', 'p2', 'p3'], noShows: [{ playerId: 'p3', markedAt: NOW }] });

    await recordMatchResult({ matchId: 'm1', winners: ['p1', 'p2'], isDraw: true }, { source: 'manual' });

    // triple threat: multi-person 0.8 × 15 = 12
    expect(await player('p1')).toMatchObject({ draws: 1, stamina: 88 });
    expect((await player('p3')).stamina).toBeUndefined();
    expect((await match('m1')).conditionReport?.map((entry) => entry.playerId)).toEqual(['p1', 'p2']);
  });

  it('does nothing while the injuries flag is off', async () => {
    await repos.user.siteConfig.updateFeatures({ injuries: false });
    await useTunables(ALWAYS);
    seedMatch({ matchId: 'm1' });

    await recordMatchResult({ matchId: 'm1', winners: ['p1'], losers: ['p2'] }, { source: 'manual' });

    expect((await player('p1')).stamina).toBeUndefined();
    expect((await match('m1')).conditionReport).toBeUndefined();
    expect(await repos.injuries.listOpen()).toEqual([]);
  });
});

describe('deleting a completed match reverts the condition (INJ-04)', () => {
  const ctx = {} as Context;
  const cb: Callback = () => {};

  it('refunds the drain and ends the injury as reverted', async () => {
    await useTunables(ALWAYS);
    seedMatch({ matchId: 'm1' });
    await recordMatchResult({ matchId: 'm1', winners: ['p1'], losers: ['p2'] }, { source: 'manual' });

    const result = await deleteMatchHandler(deleteEvent('m1'), ctx, cb);
    expect(result?.statusCode).toBe(200);

    for (const playerId of ['p1', 'p2']) {
      const reverted = await player(playerId);
      expect(reverted).toMatchObject({ wins: 0, losses: 0, stamina: 100 });
      expect(reverted.currentInjury).toBeUndefined();
      const [row] = await repos.injuries.listByPlayer(playerId);
      expect(row.endedReason).toBe('reverted');
    }
  });

  it('leaves an injury a GM already edited', async () => {
    await useTunables(ALWAYS);
    seedMatch({ matchId: 'm1' });
    await recordMatchResult({ matchId: 'm1', winners: ['p1'], losers: ['p2'] }, { source: 'manual' });
    const [row] = await repos.injuries.listByPlayer('p2');
    await repos.runInTransaction(async (tx) => {
      tx.updateInjury('p2', row.startedAt, { appendChanges: [{ kind: 'extended', at: NOW, by: 'gm' }] });
    });

    await deleteMatchHandler(deleteEvent('m1'), ctx, cb);

    const loser = await player('p2');
    expect(loser.stamina).toBe(100);
    expect(loser.currentInjury?.injuryId).toBe(row.injuryId);
    expect((await repos.injuries.get('p2', row.startedAt))?.endedAt).toBeUndefined();
  });
});
