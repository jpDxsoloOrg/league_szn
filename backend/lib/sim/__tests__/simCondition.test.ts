import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildInMemoryRepositories } from '../../repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../repositories';
import type { WrestlerBuild } from '../../repositories/types';
import type { CurrentInjury, PlayerConditionPatch } from '../../repositories/injuries';
import { TIER_BUDGETS, type CoreStat } from '../../policies/buildRules';
import { defaultBuild, effectiveBuild } from '../../policies/wrestlerBuild';
import { DEFAULT_INJURY_TUNABLES } from '../../policies/fatigueDefaults';
import { staminaSimMultiplier } from '../../policies/fatigue';
import {
  competitorFromBuild,
  simulate,
  winProbabilities,
  type SimCompetitor,
  type SimSide,
} from '../../policies/matchSim';
import { CONDITION_MODIFIER_SOURCE, loadSimInputs, simConditionFor } from '../loadSimInputs';
import { GASSED_STAMINA_SHARE, MAX_MOMENTUM_BEATS, beatTypeOf, buildPlayByPlay, conditionBeatType } from '../playByPlay';

const TUNABLES = DEFAULT_INJURY_TUNABLES;
const NOW = new Date('2026-11-24T12:00:00Z');
const NEXT_WEEK = '2026-11-30T05:00:00.000Z';
const LAST_WEEK = '2026-11-16T05:00:00.000Z';

function injury(returnsAt: string): CurrentInjury {
  return {
    injuryId: 'inj-1',
    startedAt: '2026-11-10T00:00:00.000Z',
    returnsAt,
    severity: 'moderate',
    weeks: 2,
    source: 'match',
  };
}

function stats(value: number): Record<CoreStat, number> {
  return { strikes: value, grapple: value, agility: value, endurance: value };
}

function competitor(playerId: string, stamina?: number, injured = false): SimCompetitor {
  const base: SimCompetitor = {
    playerId,
    style: 'allRounder',
    effectiveStats: stats(60),
    signatureLevels: [1],
    finisherLevels: [1],
    form: 50,
  };
  if (stamina === undefined) return base;
  return {
    ...base,
    modifiers: [{ source: CONDITION_MODIFIER_SOURCE, multiplier: staminaSimMultiplier(stamina, injured, TUNABLES) }],
    condition: { stamina, maxStamina: TUNABLES.maxStamina, injured },
  };
}

function chanceOf(sides: SimSide[], sideId: string): number {
  return winProbabilities(sides, 'standard').find((entry) => entry.sideId === sideId)?.probability ?? 0;
}

describe('stamina and injury in the sim (INJ-09)', () => {
  it('makes the tired side the underdog between equal builds', () => {
    const sides = [
      { sideId: 'fresh', members: [competitor('a', 100)] },
      { sideId: 'tired', members: [competitor('b', 20)] },
    ];
    expect(chanceOf(sides, 'tired')).toBeLessThan(0.5);
    expect(chanceOf(sides, 'fresh')).toBeGreaterThan(0.5);
  });

  it('stacks the injured penalty on top of low stamina', () => {
    const tired = [
      { sideId: 'fresh', members: [competitor('a', 100)] },
      { sideId: 'hurt', members: [competitor('b', 20)] },
    ];
    const tiredAndHurt = [
      { sideId: 'fresh', members: [competitor('a', 100)] },
      { sideId: 'hurt', members: [competitor('b', 20, true)] },
    ];
    expect(chanceOf(tiredAndHurt, 'hurt')).toBeLessThan(chanceOf(tired, 'hurt'));
    expect(staminaSimMultiplier(20, true, TUNABLES)).toBeCloseTo(
      staminaSimMultiplier(20, false, TUNABLES) * TUNABLES.simInjuredPenalty,
      10,
    );
  });

  it('changes nothing at full stamina', () => {
    const plain = [
      { sideId: 'a', members: [{ ...competitor('a'), effectiveStats: stats(80) }] },
      { sideId: 'b', members: [competitor('b')] },
    ];
    const rested = [
      { sideId: 'a', members: [{ ...competitor('a', 100), effectiveStats: stats(80) }] },
      { sideId: 'b', members: [competitor('b', 100)] },
    ];
    expect(winProbabilities(rested, 'standard')).toEqual(winProbabilities(plain, 'standard'));
  });

  it('keeps the BLD-05 calibration band at full stamina', () => {
    const budget = TIER_BUDGETS[1];
    const maxedBuild: WrestlerBuild = {
      style: 'powerhouse',
      stats: { strikes: 75, grapple: 75, agility: 75, endurance: 75 },
      updatedAt: '',
    };
    const full = [{ source: CONDITION_MODIFIER_SOURCE, multiplier: staminaSimMultiplier(100, false, TUNABLES) }];
    const maxed = competitorFromBuild(
      'maxed',
      effectiveBuild(maxedBuild, { signatures: [{}], finishers: [{ level: 3 }] }, budget),
      50,
      full,
    );
    const base = competitorFromBuild(
      'base',
      effectiveBuild({ ...defaultBuild(), style: 'allRounder' }, { signatures: [{}], finishers: [{ level: 1 }] }, budget),
      50,
      full,
    );
    const sides = [
      { sideId: 'maxed', members: [maxed] },
      { sideId: 'base', members: [base] },
    ];
    let wins = 0;
    for (let seed = 0; seed < 10_000; seed += 1) {
      if (simulate(sides, { category: 'standard', seed }).winnerSideId === 'maxed') wins += 1;
    }
    expect(wins / 10_000).toBeGreaterThanOrEqual(0.8);
    expect(wins / 10_000).toBeLessThanOrEqual(0.92);
  });
});

describe('simConditionFor', () => {
  it('treats missing stamina as full and an expired injury as healed', () => {
    const { condition, modifier } = simConditionFor({ currentInjury: injury(LAST_WEEK) }, TUNABLES, NOW);
    expect(condition).toEqual({ stamina: TUNABLES.maxStamina, maxStamina: TUNABLES.maxStamina, injured: false });
    expect(modifier).toEqual({ source: CONDITION_MODIFIER_SOURCE, multiplier: 1 });
  });

  it('applies the stamina floor and the injured penalty', () => {
    const { condition, modifier } = simConditionFor({ stamina: 0, currentInjury: injury(NEXT_WEEK) }, TUNABLES, NOW);
    expect(condition.injured).toBe(true);
    expect(modifier.multiplier).toBeCloseTo(TUNABLES.simStaminaFloor * TUNABLES.simInjuredPenalty, 10);
  });
});

describe('loadSimInputs condition', () => {
  let repos: Repositories;

  async function addPlayer(name: string, condition: PlayerConditionPatch = {}): Promise<string> {
    const created = await repos.roster.players.create({ name, currentWrestler: name });
    if (Object.keys(condition).length > 0) {
      await repos.runInTransaction(async (tx) => tx.updatePlayerCondition(created.playerId, condition));
    }
    return created.playerId;
  }

  beforeEach(() => {
    repos = buildInMemoryRepositories();
    setRepositoriesForTesting(repos);
  });

  afterEach(() => {
    resetRepositoriesForTesting();
  });

  it('adds no condition or modifier while the injuries feature is off', async () => {
    const tired = await addPlayer('Tired', { stamina: 10 });
    const other = await addPlayer('Other');
    const result = await loadSimInputs({ sides: [[tired], [other]], now: NOW });
    if (!result.ok) throw new Error('load failed');
    for (const competitor of result.inputs.competitors) {
      expect(competitor.condition).toBeUndefined();
      expect(competitor.modifiers).toBeUndefined();
    }
  });

  it('adds stamina, injury and the condition modifier while the feature is on', async () => {
    await repos.user.siteConfig.updateFeatures({ injuries: true });
    const tired = await addPlayer('Tired', { stamina: 20 });
    const hurt = await addPlayer('Hurt', { stamina: 60, currentInjury: injury(NEXT_WEEK) });
    const fresh = await addPlayer('Fresh');
    const result = await loadSimInputs({ sides: [[tired], [hurt], [fresh]], now: NOW });
    if (!result.ok) throw new Error('load failed');
    const [tiredIn, hurtIn, freshIn] = result.inputs.competitors;

    expect(tiredIn.condition).toEqual({ stamina: 20, maxStamina: 100, injured: false });
    expect(tiredIn.modifiers).toEqual([
      { source: CONDITION_MODIFIER_SOURCE, multiplier: staminaSimMultiplier(20, false, TUNABLES) },
    ]);
    expect(hurtIn.condition?.injured).toBe(true);
    expect(hurtIn.modifiers?.[0].multiplier).toBeCloseTo(staminaSimMultiplier(60, true, TUNABLES), 10);
    expect(freshIn.condition).toEqual({ stamina: 100, maxStamina: 100, injured: false });
    expect(freshIn.modifiers?.[0].multiplier).toBe(1);
  });

  it('uses the saved tunables', async () => {
    await repos.user.siteConfig.updateFeatures({ injuries: true });
    const { version: _version, updatedAt: _updatedAt, updatedBy: _updatedBy, ...input } = TUNABLES;
    await repos.user.siteConfig.saveInjuryTunables({ ...input, simStaminaFloor: 0.5 }, 'admin');
    const empty = await addPlayer('Empty', { stamina: 0 });
    const other = await addPlayer('Other');
    const result = await loadSimInputs({ sides: [[empty], [other]], now: NOW });
    if (!result.ok) throw new Error('load failed');
    expect(result.inputs.competitors[0].modifiers?.[0].multiplier).toBeCloseTo(0.5, 10);
  });
});

describe('play-by-play condition beats', () => {
  const names = { a: 'Alpha', b: 'Bravo' };

  function story(a: SimCompetitor, b: SimCompetitor, seed: number) {
    const sides = [
      { sideId: 'a', members: [a] },
      { sideId: 'b', members: [b] },
    ];
    const result = simulate(sides, { category: 'standard', seed });
    return buildPlayByPlay(result, sides, names, {});
  }

  it('picks the beat type from the condition', () => {
    expect(conditionBeatType(competitor('a'))).toBeNull();
    expect(conditionBeatType(competitor('a', 100))).toBeNull();
    expect(conditionBeatType(competitor('a', GASSED_STAMINA_SHARE * 100))).toBeNull();
    expect(conditionBeatType(competitor('a', 20))).toBe('gassed');
    expect(conditionBeatType(competitor('a', 90, true))).toBe('sellingInjury');
  });

  it('adds a "looks gassed" beat for the tired wrestler and keeps stories at 8 beats or fewer', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const beats = story(competitor('a', 100), competitor('b', 20), seed);
      const gassed = beats.filter((beat) => beatTypeOf(beat) === 'gassed');
      expect(gassed).toHaveLength(1);
      expect(gassed[0].params).toEqual({ wrestler: 'Bravo', opponent: 'Alpha' });
      expect(beats.length).toBeLessThanOrEqual(8);
      const momentum = beats.filter((beat) => beatTypeOf(beat).startsWith('momentum')).length;
      expect(momentum).toBeLessThanOrEqual(MAX_MOMENTUM_BEATS - 1);
    }
  });

  it('sells the injury before showing a gassed wrestler', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const beats = story(competitor('a', 10), competitor('b', 90, true), seed);
      const types = beats.map(beatTypeOf);
      expect(types).toContain('sellingInjury');
      expect(types).not.toContain('gassed');
      expect(beats.find((beat) => beatTypeOf(beat) === 'sellingInjury')?.params.wrestler).toBe('Bravo');
    }
  });

  it('tells the same story as before when nobody is tired or hurt', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      expect(story(competitor('a', 100), competitor('b', 100), seed)).toEqual(
        story(competitor('a'), competitor('b'), seed),
      );
    }
  });
});
