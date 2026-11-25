import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ECO-10: shop effects in injuries and the sim, against the in-memory store.

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});
vi.mock('../../asyncLambda', () => ({ invokeAsync: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../progression/trigger', () => ({ triggerProgressionRecompute: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../matchPay', () => ({
  settleMatchPay: vi.fn().mockResolvedValue(undefined),
  reverseMatchPay: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../refundSimBoosts', () => ({ refundSimBoosts: vi.fn().mockResolvedValue(0) }));
vi.mock('../../../functions/matches/updateGroupStats', () => ({ updateGroupStats: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../notifications', () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }));

import { buildInMemoryRepositories, type InMemoryCompetitionRepository, type InMemoryRosterRepository } from '../../repositories/inMemory';
import { resetRepositoriesForTesting, setRepositoriesForTesting, type Repositories } from '../../repositories';
import { ConcurrencyError } from '../../repositories/errors';
import { toCurrentInjury, type Injury } from '../../repositories/injuries';
import type {
  InjuryShieldEffect,
  Match,
  Player,
  RehabEffect,
  StaminaTopUpEffect,
} from '../../repositories/types';
import { recordMatchResult } from '../../services/recordMatchResult';
import { DEFAULT_INJURY_TUNABLES, toInjuryTunablesInput, type InjuryChanceBand } from '../../policies/fatigueDefaults';
import { returnDate } from '../../policies/fatigue';
import { refundSimBoosts } from '../refundSimBoosts';
import {
  activeInjuryShield,
  applyPendingEffects,
  consumeInjuryShields,
  injuryShieldReduction,
  rehabReturnDate,
  toppedUpStamina,
} from '../applyEffects';

const TZ = 'America/New_York';
const NOW = '2026-11-24T20:00:00.000Z'; // Tuesday

const meta = (effectId: string) => ({ effectId, purchasedAt: NOW, purchaseKey: `key-${effectId}` });
const shield = (effectId: string, matchesLeft: number, reduction = 0.5): InjuryShieldEffect =>
  ({ ...meta(effectId), kind: 'injuryShield', reduction, matchesLeft });
const rehab = (effectId: string, weeksOff = 1): RehabEffect => ({ ...meta(effectId), kind: 'rehab', weeksOff });
const topUp = (effectId: string, amount = 20): StaminaTopUpEffect => ({ ...meta(effectId), kind: 'staminaTopUp', amount });

let repos: Repositories;

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

async function seedInjury(playerId: string, startedAt: string, weeks: number): Promise<Injury> {
  const injury: Injury = {
    playerId,
    startedAt,
    injuryId: `inj-${playerId}`,
    source: 'match',
    severity: 'major',
    weeks,
    returnsAt: returnDate(startedAt, weeks, TZ).toISOString(),
    changes: [],
  };
  await repos.runInTransaction(async (tx) => {
    tx.putInjury(injury);
    tx.updatePlayerCondition(playerId, { currentInjury: toCurrentInjury(injury) });
  });
  return injury;
}

async function useBands(injuryChanceBands: InjuryChanceBand[]): Promise<void> {
  await repos.user.siteConfig.saveInjuryTunables(
    { ...toInjuryTunablesInput(DEFAULT_INJURY_TUNABLES), injuryChanceBands },
    'gm',
  );
}

const player = async (playerId: string) => (await repos.roster.players.findById(playerId))!;

beforeEach(async () => {
  vi.clearAllMocks();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  await repos.user.siteConfig.updateFeatures({ injuries: true, economy: true });
});

afterEach(() => resetRepositoriesForTesting());

describe('injury shield', () => {
  it('reads the active shield only', () => {
    expect(injuryShieldReduction({ effects: [topUp('t'), shield('s', 2, 0.4)] })).toBe(0.4);
    expect(activeInjuryShield({ effects: [topUp('t'), shield('s', 2)] })?.index).toBe(1);
    expect(injuryShieldReduction({ effects: [shield('s', 0)] })).toBe(0);
    expect(injuryShieldReduction({})).toBe(0);
  });

  it('a shielded roll uses the reduced chance, is marked shielded and counts one match down', async () => {
    await useBands([{ minStamina: 0, chance: 0.4 }]);
    seedPlayer('p1', { effects: [shield('s1', 3, 0.5)] });
    seedPlayer('p2');
    seedMatch({ matchId: 'm1' });

    const outcome = await recordMatchResult({ matchId: 'm1', winners: ['p1'], losers: ['p2'] }, { source: 'manual' });

    const report = outcome.match.conditionReport!;
    const shielded = report.find((entry) => entry.playerId === 'p1')!;
    const plain = report.find((entry) => entry.playerId === 'p2')!;
    expect(shielded.shielded).toBe(true);
    expect(shielded.chance).toBeCloseTo(plain.chance * 0.5, 10);
    expect(plain.shielded).toBeUndefined();
    expect((await player('p1')).effects).toEqual([shield('s1', 2, 0.5)]);
  });

  it('a shield on its last match is removed after use', async () => {
    await useBands([{ minStamina: 0, chance: 0 }]);
    seedPlayer('p1', { effects: [topUp('t1'), shield('s1', 1)] });
    seedPlayer('p2');
    seedMatch({ matchId: 'm1' });

    await recordMatchResult({ matchId: 'm1', winners: ['p1'], losers: ['p2'] }, { source: 'manual' });

    expect((await player('p1')).effects).toEqual([topUp('t1')]);
  });

  it('does nothing while the injuries feature is off', async () => {
    await repos.user.siteConfig.updateFeatures({ injuries: false });
    seedPlayer('p1', { effects: [shield('s1', 3)] });
    seedPlayer('p2');
    seedMatch({ matchId: 'm1' });

    await recordMatchResult({ matchId: 'm1', winners: ['p1'], losers: ['p2'] }, { source: 'manual' });

    expect((await player('p1')).effects).toEqual([shield('s1', 3)]);
  });

  it('consumeInjuryShields skips a player whose shield is gone', async () => {
    seedPlayer('p1', { effects: [topUp('t1')] });
    await consumeInjuryShields(['p1', 'missing']);
    expect((await player('p1')).effects).toEqual([topUp('t1')]);
  });

  it('a stale effect position fails the write (used exactly once)', async () => {
    seedPlayer('p1', { effects: [shield('s1', 2)] });
    await expect(repos.runInTransaction(async (tx) => {
      tx.updatePlayerCondition('p1', { useEffect: { effectId: 's1', index: 0, matchesLeft: { before: 3, after: 2 } } });
    })).rejects.toBeInstanceOf(ConcurrencyError);
    await expect(repos.runInTransaction(async (tx) => {
      tx.updatePlayerCondition('p1', { useEffect: { effectId: 'other', index: 0 } });
    })).rejects.toBeInstanceOf(ConcurrencyError);
    expect((await player('p1')).effects).toEqual([shield('s1', 2)]);
  });
});

describe('rehabReturnDate', () => {
  it('moves the return one league week earlier, still on a Sunday boundary', () => {
    const startedAt = '2026-11-03T20:00:00.000Z';
    const returnsAt = returnDate(startedAt, 6, TZ).toISOString();
    const moved = rehabReturnDate({ startedAt, returnsAt }, 1, NOW, TZ);
    expect(moved).toBe(returnDate(startedAt, 5, TZ).toISOString());
  });

  it('never goes below one week from the injury start', () => {
    const startedAt = '2026-11-23T20:00:00.000Z';
    const returnsAt = returnDate(startedAt, 2, TZ).toISOString();
    const moved = rehabReturnDate({ startedAt, returnsAt }, 5, '2026-11-24T00:00:00.000Z', TZ);
    expect(moved).toBe(returnDate(startedAt, 1, TZ).toISOString());
  });

  it('never goes before the next boundary from now, nor later than it was', () => {
    const startedAt = '2026-10-01T20:00:00.000Z';
    const returnsAt = returnDate(startedAt, 10, TZ).toISOString();
    expect(rehabReturnDate({ startedAt, returnsAt }, 20, NOW, TZ)).toBe(returnDate(NOW, 0, TZ).toISOString());
    expect(rehabReturnDate({ startedAt, returnsAt }, 0, NOW, TZ)).toBe(returnsAt);
  });
});

describe('applyPendingEffects', () => {
  it('a top-up adds stamina capped at the maximum and is used once', async () => {
    expect(toppedUpStamina(90, 20, 100)).toBe(100);
    expect(toppedUpStamina(30, 20, 100)).toBe(50);

    seedPlayer('p1', { stamina: 90, effects: [topUp('t1', 20)] });
    expect(await applyPendingEffects('p1')).toEqual(['t1']);
    expect(await player('p1')).toMatchObject({ stamina: 100, effects: [] });

    expect(await applyPendingEffects('p1')).toEqual([]);
    expect((await player('p1')).stamina).toBe(100);
  });

  it('rehab shortens the active injury, logs a rehab change and is used once', async () => {
    const startedAt = '2026-11-23T20:00:00.000Z';
    seedPlayer('p1', { effects: [rehab('r1')] });
    const injury = await seedInjury('p1', startedAt, 4);

    expect(await applyPendingEffects('p1', new Date(NOW))).toEqual(['r1']);

    const expected = returnDate(startedAt, 3, TZ).toISOString();
    const stored = await player('p1');
    expect(stored.currentInjury).toMatchObject({ injuryId: injury.injuryId, returnsAt: expected, weeks: 3 });
    expect(stored.effects).toEqual([]);
    const row = await repos.injuries.get('p1', startedAt);
    expect(row?.returnsAt).toBe(expected);
    expect(row?.changes).toEqual([expect.objectContaining({
      kind: 'rehab',
      by: 'user-p1',
      returnsAtBefore: injury.returnsAt,
      returnsAtAfter: expected,
      weeksBefore: 4,
      weeksAfter: 3,
    })]);
  });

  it('rehab without an active injury waits; a top-up behind it still applies', async () => {
    seedPlayer('p1', { stamina: 40, effects: [rehab('r1'), topUp('t1', 20)] });
    expect(await applyPendingEffects('p1', new Date(NOW))).toEqual(['t1']);
    expect(await player('p1')).toMatchObject({ stamina: 60, effects: [rehab('r1')] });
  });
});

describe('sim boosts on the result path', () => {
  it('a simulated result never refunds its boosts', async () => {
    await repos.user.siteConfig.updateFeatures({ injuries: false });
    seedPlayer('p1');
    seedPlayer('p2');
    seedMatch({ matchId: 'm1', simBoosts: [{ playerId: 'p1', boost: 5, purchasedAt: NOW, purchaseKey: 'k1' }] });

    await recordMatchResult({ matchId: 'm1', winners: ['p1'], losers: ['p2'] }, { source: 'sim' });

    expect(refundSimBoosts).not.toHaveBeenCalled();
  });
});
