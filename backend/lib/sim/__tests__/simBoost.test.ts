import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildInMemoryRepositories } from '../../repositories/inMemory';
import { setRepositoriesForTesting, resetRepositoriesForTesting, type Repositories } from '../../repositories';
import type { MatchSimulation } from '../../repositories/types';
import type { CoreStat } from '../../policies/buildRules';
import {
  SIM_BOOST_MODIFIER_SOURCE,
  simulate,
  winProbabilities,
  type SimCompetitor,
  type SimSide,
} from '../../policies/matchSim';
import { CONDITION_MODIFIER_SOURCE, loadSimInputs, simBoostMultiplier } from '../loadSimInputs';
import { beatTypeOf, buildPlayByPlay } from '../playByPlay';
import { toPublicMatchSimulation } from '../publicSimulation';

// ECO-10: a bought sim boost in the sim, the play-by-play and the public view.

function stats(value: number): Record<CoreStat, number> {
  return { strikes: value, grapple: value, agility: value, endurance: value };
}

function competitor(playerId: string, boost?: number): SimCompetitor {
  return {
    playerId,
    style: 'allRounder',
    effectiveStats: stats(60),
    signatureLevels: [1],
    finisherLevels: [1],
    form: 50,
    ...(boost !== undefined && {
      modifiers: [{ source: SIM_BOOST_MODIFIER_SOURCE, multiplier: simBoostMultiplier(boost) }],
    }),
  };
}

const chanceOf = (sides: SimSide[], sideId: string): number =>
  winProbabilities(sides, 'standard').find((entry) => entry.sideId === sideId)?.probability ?? 0;

const NAMES = { a: 'Alpha', b: 'Bravo', c: 'Charlie', d: 'Delta' };

describe('sim boost rating', () => {
  it('reads the boost as a percentage', () => {
    expect(simBoostMultiplier(5)).toBeCloseTo(1.05, 10);
    expect(simBoostMultiplier(0)).toBe(1);
    expect(simBoostMultiplier(-3)).toBe(1);
  });

  it('a boosted side gains over an equal build', () => {
    const even = [
      { sideId: 'a', members: [competitor('a')] },
      { sideId: 'b', members: [competitor('b')] },
    ];
    const boosted = [
      { sideId: 'a', members: [competitor('a', 5)] },
      { sideId: 'b', members: [competitor('b')] },
    ];
    expect(chanceOf(even, 'a')).toBeCloseTo(0.5, 3);
    expect(chanceOf(boosted, 'a')).toBeGreaterThan(0.5);
  });
});

describe('loadSimInputs sim boosts', () => {
  let repos: Repositories;

  beforeEach(() => {
    repos = buildInMemoryRepositories();
    setRepositoriesForTesting(repos);
  });

  afterEach(() => resetRepositoriesForTesting());

  async function addPlayer(name: string): Promise<string> {
    return (await repos.roster.players.create({ name, currentWrestler: name })).playerId;
  }

  it('adds a simBoost modifier only for boosted players, after the condition modifier', async () => {
    await repos.user.siteConfig.updateFeatures({ injuries: true });
    const buyer = await addPlayer('Buyer');
    const other = await addPlayer('Other');
    const result = await loadSimInputs({
      sides: [[buyer], [other]],
      simBoosts: [{ playerId: buyer, boost: 5 }, { playerId: 'not-in-match', boost: 5 }],
    });
    if (!result.ok) throw new Error('load failed');
    const [buyerIn, otherIn] = result.inputs.competitors;
    expect(buyerIn.modifiers?.map((modifier) => modifier.source)).toEqual([CONDITION_MODIFIER_SOURCE, SIM_BOOST_MODIFIER_SOURCE]);
    expect(buyerIn.modifiers?.[1].multiplier).toBeCloseTo(1.05, 10);
    expect(otherIn.modifiers?.map((modifier) => modifier.source)).toEqual([CONDITION_MODIFIER_SOURCE]);
  });

  it('boosts with the injuries feature off too', async () => {
    const buyer = await addPlayer('Buyer');
    const other = await addPlayer('Other');
    const result = await loadSimInputs({ sides: [[buyer], [other]], simBoosts: [{ playerId: buyer, boost: 10 }] });
    if (!result.ok) throw new Error('load failed');
    expect(result.inputs.competitors[0].modifiers).toEqual([{ source: SIM_BOOST_MODIFIER_SOURCE, multiplier: 1.1 }]);
    expect(result.inputs.competitors[1].modifiers).toBeUndefined();
  });
});

describe('run-in beat', () => {
  const storyFor = (sides: SimSide[], seed: number) =>
    buildPlayByPlay(simulate(sides, { category: 'standard', seed }), sides, NAMES, {});

  it('appears only for a boosted competitor', () => {
    const sides = [
      { sideId: 'a', members: [competitor('a', 5)] },
      { sideId: 'b', members: [competitor('b')] },
    ];
    for (let seed = 0; seed < 200; seed += 1) {
      const runIns = storyFor(sides, seed).filter((beat) => beatTypeOf(beat) === 'runIn');
      expect(runIns).toHaveLength(1);
      expect(runIns[0].params.wrestler).toBe('Alpha');
    }
  });

  it('never appears without a boost, and the story is unchanged', () => {
    const sides = [
      { sideId: 'a', members: [competitor('a')] },
      { sideId: 'b', members: [competitor('b')] },
    ];
    for (let seed = 0; seed < 200; seed += 1) {
      expect(storyFor(sides, seed).some((beat) => beatTypeOf(beat) === 'runIn')).toBe(false);
    }
  });

  it('keeps stories at 8 beats or fewer with a condition beat and a run-in in a close match', () => {
    const tired = (playerId: string, boost?: number): SimCompetitor => ({
      ...competitor(playerId, boost),
      condition: { stamina: 10, maxStamina: 100, injured: true },
    });
    const sides = [
      { sideId: 'a', members: [tired('a', 5)] },
      { sideId: 'b', members: [tired('b', 5)] },
    ];
    for (let seed = 0; seed < 500; seed += 1) {
      const story = storyFor(sides, seed);
      expect(story.some((beat) => ['nearFall', 'finisherKickout'].includes(beatTypeOf(beat)))).toBe(true);
      expect(story.length).toBeLessThanOrEqual(8);
      expect(story.some((beat) => beatTypeOf(beat) === 'runIn')).toBe(true);
      expect(story.some((beat) => beatTypeOf(beat) === 'sellingInjury')).toBe(true);
    }
  });

  it('is left out of the public story', () => {
    const simulation = {
      seed: 1,
      category: 'standard',
      rulesVersion: 1,
      inputsDigest: 'x',
      winnerSideId: 'a',
      probabilities: [],
      playByPlay: [
        { key: 'sim.beats.opening.v1', params: {} },
        { key: 'sim.beats.runIn.v2', params: { wrestler: 'Alpha', opponent: 'Bravo' } },
        { key: 'sim.beats.finishPin.v1', params: {} },
      ],
      specialtyHits: [],
      scaledPlayerIds: [],
      simBoostedPlayerIds: ['a'],
      formWindow: { kind: 'recent', matchLimit: 10 },
      simulatedAt: '2026-11-24T00:00:00.000Z',
    } as MatchSimulation;
    const shown = toPublicMatchSimulation(simulation);
    expect(shown.playByPlay.map((beat) => beat.key)).toEqual(['sim.beats.opening.v1', 'sim.beats.finishPin.v1']);
    expect(shown).not.toHaveProperty('simBoostedPlayerIds');
  });
});
