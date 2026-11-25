import { describe, it, expect } from 'vitest';
import {
  BEAT_VARIANTS,
  KICKOUT_BEAT_TYPES,
  MAX_MOMENTUM_BEATS,
  MIN_MOMENTUM_BEATS,
  beatTypeOf,
  buildPlayByPlay,
  finishesBySubmission,
  isCloseMatch,
  moveDisplayName,
  topWeightedStat,
  type PlayByPlayMoves,
  type SimBeat,
} from '../playByPlay';
import { simulate, type SimCompetitor, type SimSide } from '../../policies/matchSim';
import type { CoreStat, SimCategory, StyleId } from '../../policies/buildRules';
import type { WrestlerMove } from '../../repositories/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const localesDir = join(__dirname, '../../../../frontend/src/i18n/locales');
const enLocale: unknown = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf8'));
const deLocale: unknown = JSON.parse(readFileSync(join(localesDir, 'de.json'), 'utf8'));

function competitor(
  playerId: string,
  style: StyleId,
  stats: Partial<Record<CoreStat, number>> = {},
  levels = 1,
): SimCompetitor {
  return {
    playerId,
    style,
    effectiveStats: { strikes: 60, grapple: 60, agility: 60, endurance: 60, ...stats },
    signatureLevels: [levels],
    finisherLevels: [levels],
    form: 50,
  };
}

const maxed = (playerId: string, style: StyleId = 'brawler'): SimCompetitor =>
  competitor(playerId, style, { strikes: 100, grapple: 100, agility: 100, endurance: 100 }, 5);
const base = (playerId: string, style: StyleId = 'brawler'): SimCompetitor =>
  competitor(playerId, style, { strikes: 40, grapple: 40, agility: 40, endurance: 40 }, 1);

const move = (gameName: string, customName = ''): WrestlerMove => ({ gameName, customName });

function namesFor(sides: readonly SimSide[]): Record<string, string> {
  return Object.fromEntries(
    sides.flatMap((side) => side.members.map((member) => [member.playerId, `Name of ${member.playerId}`])),
  );
}

/** Moves whose names say who owns them, so ownership can be checked from text. */
function movesFor(sides: readonly SimSide[]): PlayByPlayMoves {
  return Object.fromEntries(
    sides.flatMap((side) =>
      side.members.map((member) => [
        member.playerId,
        {
          signatures: [move(`${member.playerId}-sig-game`, `${member.playerId}-sig`), move(`${member.playerId}-sig2`)],
          finishers: [move(`${member.playerId}-fin-game`, `${member.playerId}-fin`)],
        },
      ]),
    ),
  );
}

function run(sides: SimSide[], seed: number, category: SimCategory = 'standard', moves?: PlayByPlayMoves) {
  const result = simulate(sides, { category, seed });
  const beats = buildPlayByPlay(result, sides, namesFor(sides), moves ?? movesFor(sides));
  return { result, beats };
}

const singlesEven = (): SimSide[] => [
  { sideId: 'a', members: [competitor('p1', 'brawler')] },
  { sideId: 'b', members: [competitor('p2', 'brawler')] },
];
const singlesMismatch = (): SimSide[] => [
  { sideId: 'a', members: [maxed('p1')] },
  { sideId: 'b', members: [base('p2')] },
];

function winnerNames(sides: readonly SimSide[], winnerSideId: string): string[] {
  const winner = sides.find((side) => side.sideId === winnerSideId);
  return (winner?.members ?? []).map((member) => `Name of ${member.playerId}`);
}

function hasKickout(beats: readonly SimBeat[]): boolean {
  return beats.some((beat) => (KICKOUT_BEAT_TYPES as readonly string[]).includes(beatTypeOf(beat)));
}

function lookup(locale: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object') return (node as Record<string, unknown>)[part];
    return undefined;
  }, locale);
}

describe('buildPlayByPlay', () => {
  it('is deterministic for the same result', () => {
    const first = run(singlesEven(), 1234);
    const second = run(singlesEven(), 1234);
    expect(second.beats).toEqual(first.beats);
  });

  it('varies across seeds', () => {
    const stories = new Set(
      Array.from({ length: 30 }, (_, seed) => JSON.stringify(run(singlesEven(), seed).beats.map((beat) => beat.key))),
    );
    expect(stories.size).toBeGreaterThan(5);
  });

  it('does not shift the draw', () => {
    const sides = singlesEven();
    for (let seed = 0; seed < 50; seed += 1) {
      const result = simulate(sides, { category: 'standard', seed });
      buildPlayByPlay(result, sides, namesFor(sides), movesFor(sides));
      expect(simulate(sides, { category: 'standard', seed }).winnerSideId).toBe(result.winnerSideId);
    }
  });

  it('follows the story shape: opening, 2–4 momentum, signature, finisher, finish', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const { beats } = run(singlesMismatch(), seed);
      const types = beats.map(beatTypeOf);
      expect(types[0]).toBe('opening');
      const momentum = types.filter((type) => type.startsWith('momentum')).length;
      expect(momentum).toBeGreaterThanOrEqual(MIN_MOMENTUM_BEATS);
      expect(momentum).toBeLessThanOrEqual(MAX_MOMENTUM_BEATS);
      expect(types[momentum + 1]).toBe('signature');
      expect(types[types.length - 2]).toBe('finisher');
      expect(['finishPin', 'finishSubmission']).toContain(types[types.length - 1]);
      expect(beats.length).toBeGreaterThanOrEqual(5);
      expect(beats.length).toBeLessThanOrEqual(8);
    }
  });

  it('keeps close stories at 8 beats or fewer', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      expect(run(singlesEven(), seed).beats.length).toBeLessThanOrEqual(8);
    }
  });

  it('ends with the winner scoring the fall, including upsets', () => {
    const winners = new Set<string>();
    for (let seed = 0; seed < 300; seed += 1) {
      const sides = singlesMismatch();
      const { result, beats } = run(sides, seed);
      winners.add(result.winnerSideId);
      const last = beats[beats.length - 1];
      expect(winnerNames(sides, result.winnerSideId)).toContain(last?.params.wrestler);
      expect(beats[beats.length - 2]?.params.wrestler).toBe(last?.params.wrestler);
    }
    expect(winners).toEqual(new Set(['a', 'b']));
  });

  it('never names a move the wrestler does not have', () => {
    const sides: SimSide[] = [
      { sideId: 'a', members: [competitor('p1', 'striker'), competitor('p2', 'technician')] },
      { sideId: 'b', members: [competitor('p3', 'highFlyer'), competitor('p4', 'powerhouse')] },
    ];
    const names = namesFor(sides);
    const playerByName = new Map(Object.entries(names).map(([playerId, name]) => [name, playerId]));
    for (let seed = 0; seed < 200; seed += 1) {
      const { beats } = run(sides, seed);
      for (const beat of beats.filter((entry) => entry.params.move !== undefined)) {
        const owner = playerByName.get(beat.params.wrestler);
        expect(beat.params.move.startsWith(`${owner}-`)).toBe(true);
        const type = beatTypeOf(beat);
        if (type === 'signature') expect(beat.params.move).toMatch(/-sig2?$/);
        else expect(beat.params.move).toMatch(/-fin$/);
      }
    }
  });

  it('calls moves by their custom name, falling back to the game name', () => {
    expect(moveDisplayName(move('RKO', 'Outta Nowhere'))).toBe('Outta Nowhere');
    expect(moveDisplayName(move('RKO', '  '))).toBe('RKO');
    const signatureMoves = new Set<string>();
    for (let seed = 0; seed < 100; seed += 1) {
      for (const beat of run(singlesEven(), seed).beats) {
        if (beatTypeOf(beat) === 'signature') signatureMoves.add(beat.params.move.replace(/^p\d-/, ''));
      }
    }
    expect(signatureMoves).toEqual(new Set(['sig', 'sig2']));
  });

  it('uses generic beats for wrestlers with no moves', () => {
    const sides = singlesEven();
    const noMoves: PlayByPlayMoves = { p1: { signatures: [], finishers: [move('  ', '')] } };
    for (let seed = 0; seed < 50; seed += 1) {
      const { beats } = run(sides, seed, 'standard', noMoves);
      expect(beats.every((beat) => beat.params.move === undefined)).toBe(true);
      const types = beats.map(beatTypeOf);
      expect(types).toContain('signatureGeneric');
      expect(types).toContain('finisherGeneric');
    }
  });

  it('adds a kick-out beat for close matches only', () => {
    const evenCount = Array.from({ length: 100 }, (_, seed) => run(singlesEven(), seed)).filter(({ result, beats }) => {
      expect(isCloseMatch(result)).toBe(true);
      return hasKickout(beats);
    }).length;
    expect(evenCount).toBe(100);

    for (let seed = 0; seed < 100; seed += 1) {
      const { result, beats } = run(singlesMismatch(), seed);
      expect(isCloseMatch(result)).toBe(false);
      expect(hasKickout(beats)).toBe(false);
    }
  });

  it('has the challenger nearly win and the eventual winner kick out', () => {
    const kickoutTypes = new Set<string>();
    for (let seed = 0; seed < 100; seed += 1) {
      const sides = singlesEven();
      const { result, beats } = run(sides, seed);
      const kickout = beats.find((beat) => (KICKOUT_BEAT_TYPES as readonly string[]).includes(beatTypeOf(beat)));
      kickoutTypes.add(beatTypeOf(kickout as SimBeat));
      expect(winnerNames(sides, result.winnerSideId)).toContain(kickout?.params.opponent);
      expect(winnerNames(sides, result.winnerSideId)).not.toContain(kickout?.params.wrestler);
    }
    expect(kickoutTypes).toEqual(new Set(KICKOUT_BEAT_TYPES));
  });

  it('names the right people in tag matches', () => {
    const sides: SimSide[] = [
      { sideId: 'a', members: [competitor('p1', 'striker'), competitor('p2', 'technician')] },
      { sideId: 'b', members: [competitor('p3', 'highFlyer'), competitor('p4', 'powerhouse')] },
    ];
    const sideOf = new Map(
      sides.flatMap((side) => side.members.map((member) => [`Name of ${member.playerId}`, side.sideId])),
    );
    for (let seed = 0; seed < 100; seed += 1) {
      const { result, beats } = run(sides, seed);
      expect(beatTypeOf(beats[0])).toBe('openingTag');
      for (const beat of beats) {
        expect(sideOf.has(beat.params.wrestler)).toBe(true);
        expect(sideOf.has(beat.params.opponent)).toBe(true);
        expect(sideOf.get(beat.params.wrestler)).not.toBe(sideOf.get(beat.params.opponent));
      }
      const last = beats[beats.length - 1] as SimBeat;
      expect(sideOf.get(last.params.wrestler)).toBe(result.winnerSideId);
      expect(sideOf.get(last.params.opponent)).not.toBe(result.winnerSideId);
    }
  });

  it('names the right people in multi-person matches', () => {
    const sides: SimSide[] = ['a', 'b', 'c', 'd'].map((sideId, index) => ({
      sideId,
      members: [competitor(`p${index + 1}`, 'allRounder')],
    }));
    const sideOf = new Map(sides.map((side) => [`Name of ${side.members[0].playerId}`, side.sideId]));
    const finishWinners = new Set<string>();
    for (let seed = 0; seed < 200; seed += 1) {
      const { result, beats } = run(sides, seed);
      expect(beatTypeOf(beats[0])).toBe('openingMulti');
      for (const beat of beats) {
        expect(sideOf.get(beat.params.wrestler)).not.toBe(sideOf.get(beat.params.opponent));
      }
      const last = beats[beats.length - 1] as SimBeat;
      expect(sideOf.get(last.params.wrestler)).toBe(result.winnerSideId);
      finishWinners.add(result.winnerSideId);
    }
    expect(finishWinners.size).toBe(4);
  });

  it('biases momentum toward the favourite and uses its top-weighted stat', () => {
    const sides: SimSide[] = [
      { sideId: 'a', members: [{ ...maxed('p1', 'highFlyer'), effectiveStats: { strikes: 70, grapple: 70, agility: 100, endurance: 70 } }] },
      { sideId: 'b', members: [base('p2')] },
    ];
    let favourite = 0;
    let underdog = 0;
    for (let seed = 0; seed < 300; seed += 1) {
      const { beats } = run(sides, seed, 'highRisk');
      for (const beat of beats.filter((entry) => beatTypeOf(entry).startsWith('momentum'))) {
        if (beat.params.wrestler === 'Name of p1') {
          favourite += 1;
          expect(beatTypeOf(beat)).toBe('momentumAgility');
        } else {
          underdog += 1;
        }
      }
    }
    expect(underdog).toBeGreaterThan(0);
    expect(favourite).toBeGreaterThan(underdog * 2);
  });

  it('finishes technicians and grapple-first builds by submission', () => {
    expect(finishesBySubmission(competitor('t', 'technician', { grapple: 40 }))).toBe(true);
    expect(finishesBySubmission(competitor('g', 'powerhouse', { grapple: 90 }))).toBe(true);
    expect(finishesBySubmission(competitor('s', 'striker', { strikes: 95, grapple: 90 }))).toBe(false);
    expect(finishesBySubmission(competitor('b', 'brawler'))).toBe(false);

    const sides: SimSide[] = [
      { sideId: 'a', members: [maxed('p1', 'technician')] },
      { sideId: 'b', members: [base('p2')] },
    ];
    for (let seed = 0; seed < 50; seed += 1) {
      const { result, beats } = run(sides, seed);
      expect(beatTypeOf(beats[beats.length - 1] as SimBeat)).toBe(result.winnerSideId === 'a' ? 'finishSubmission' : 'finishPin');
    }
  });

  it('picks the top-weighted stat with the category weights', () => {
    const even = competitor('x', 'allRounder', { strikes: 70, agility: 70, grapple: 70, endurance: 70 });
    expect(topWeightedStat(even, { category: 'highRisk' })).toBe('agility');
    expect(topWeightedStat(even, { category: 'hardcore' })).toBe('strikes');
    expect(topWeightedStat(even, { category: 'technical' })).toBe('grapple');
    expect(topWeightedStat(even, { category: 'endurance' })).toBe('endurance');
  });

  it('returns no beats when the winner is not one of the sides', () => {
    const sides = singlesEven();
    const result = { ...simulate(sides, { category: 'standard', seed: 1 }), winnerSideId: 'missing' };
    expect(buildPlayByPlay(result, sides, namesFor(sides), {})).toEqual([]);
  });

  it('has every beat variant in the EN and DE locales with the params it uses', () => {
    for (const [type, count] of Object.entries(BEAT_VARIANTS)) {
      for (let variant = 1; variant <= count; variant += 1) {
        const key = `sim.beats.${type}.v${variant}`;
        for (const locale of [enLocale, deLocale]) {
          const text = lookup(locale, key);
          expect(typeof text, key).toBe('string');
          expect(text as string).toContain('{{wrestler}}');
          if (['signature', 'finisher', 'finisherKickout'].includes(type)) {
            expect(text as string, key).toContain('{{move}}');
          } else {
            expect(text as string, key).not.toContain('{{move}}');
          }
        }
      }
    }
  });
});
