/**
 * Match sim policy (BLD-05): ratings, style matchups, specialties, odds and a
 * seeded draw.
 *
 * Pure and deterministic: the same sides, options and seed always give the
 * same result. No `Math.random`, no I/O, no clock.
 *
 * How a result is decided:
 *   1. Each competitor gets a rating (`competitorRating`):
 *        weighted stats (weights by the match's sim category)
 *        + MOVE_WEIGHT × move score (best finisher 60%, average signature 40%, 0–100)
 *        + FORM_WEIGHT × form (0–100)
 *      then × (1 + specialty bonus) when the match's category is their
 *      specialty, then × every optional modifier (stamina, injuries, shop
 *      boosts, added later by INJ-09 / ECO-10).
 *   2. Each side's rating (`sideRating`) is the mean of its members, × (1 +
 *      STYLE_EDGE × net style edge against every opposing member).
 *   3. `winProbabilities`: softmax of rating / TEMPERATURE, then every side is
 *      lifted to at least MIN_WIN_CHANCE (upsets always possible).
 *   4. `simulate` draws one number from a mulberry32 stream seeded with
 *      `seed` and picks the winning side by cumulative probability.
 *
 * Draws are not produced in v1: every sim has exactly one winning side.
 *
 * Tunables live here and in `buildRules.ts`. Changing any of them changes
 * outcomes for a given seed, so bump `RULES_VERSION` in `buildRules.ts`
 * whenever a value in this file changes too.
 */
import { createHash } from 'crypto';
import {
  CORE_STATS,
  MOVE_LEVEL_MAX,
  MOVE_LEVEL_MIN,
  RULES_VERSION,
  STYLE_EDGE,
  specialtyBonusFor,
  styleMatchup,
  type CoreStat,
  type SimCategory,
  type StyleId,
} from './buildRules';
import type { EffectiveBuild } from './wrestlerBuild';

// ─── Tunables ───────────────────────────────────────────────────────

export type StatWeights = Readonly<Record<CoreStat, number>>;

/** Stat weights for a `standard` match. Each weight set sums to 1. */
export const STAT_WEIGHTS_DEFAULT: StatWeights = {
  strikes: 0.3,
  grapple: 0.3,
  agility: 0.2,
  endurance: 0.2,
};

/** Stat weights by the match's sim category (BLD-16). */
export const STAT_WEIGHTS_BY_CATEGORY: Readonly<Record<SimCategory, StatWeights>> = {
  standard: STAT_WEIGHTS_DEFAULT,
  highRisk: { strikes: 0.2, grapple: 0.2, agility: 0.4, endurance: 0.2 },
  technical: { strikes: 0.2, grapple: 0.45, agility: 0.15, endurance: 0.2 },
  endurance: { strikes: 0.2, grapple: 0.2, agility: 0.2, endurance: 0.4 },
  hardcore: { strikes: 0.4, grapple: 0.25, agility: 0.1, endurance: 0.25 },
  cage: { strikes: 0.35, grapple: 0.35, agility: 0.15, endurance: 0.15 },
};

/** Weight of the 0–100 move score (finisher and signature levels). */
export const MOVE_WEIGHT = 0.15;
/** Weight of the 0–100 form score. */
export const FORM_WEIGHT = 0.2;
/** Share of the move score from the best finisher; the rest is the average signature. */
export const FINISHER_SHARE = 0.6;
/**
 * Softmax temperature in rating points: higher = more chaotic. At 25 a maxed
 * tier-1 build beats a base build about 83% of the time, about 89% with its
 * specialty and a style edge on top (BLD-05 band: 80–92%). A style edge alone
 * makes an even matchup about 55–57%, since the winner of the pairing gets
 * +STYLE_EDGE and the loser −STYLE_EDGE.
 */
export const TEMPERATURE = 25;
/** Every side wins at least this often, so upsets can always happen. */
export const MIN_WIN_CHANCE = 0.05;
/** Neutral form for a competitor without one. */
export const NEUTRAL_FORM = 50;

// ─── Inputs ─────────────────────────────────────────────────────────

/**
 * A multiplier on one competitor's rating from outside the build, e.g.
 * INJ-09's stamina/injury multiplier or ECO-10's paid sim boost (1 + boost).
 * `source` is a short stable label kept in the result for GM previews.
 */
export interface SimModifier {
  source: string;
  multiplier: number;
}

export interface SimCompetitor {
  playerId: string;
  style: StyleId;
  specialty?: SimCategory;
  /** Effective stats from `effectiveBuild` (scaled to budget, style bonus applied). */
  effectiveStats: Record<CoreStat, number>;
  signatureLevels: readonly number[];
  finisherLevels: readonly number[];
  /** 0–100; clamped. */
  form: number;
  /** Optional rating multipliers (INJ-09 stamina/injury, ECO-10 sim boosts). */
  modifiers?: readonly SimModifier[];
}

export interface SimSide {
  sideId: string;
  members: readonly SimCompetitor[];
}

export interface SimOptions {
  /** From `resolveSimCategory` (lib/sim/category.ts). */
  category: SimCategory;
  /** Any finite number; normalized to an unsigned 32-bit integer. */
  seed: number;
}

// ─── Results ────────────────────────────────────────────────────────

export interface CompetitorRating {
  playerId: string;
  sideId: string;
  /** Final rating after the specialty bonus and modifiers. */
  rating: number;
  /** Rating before the specialty bonus and modifiers. */
  baseRating: number;
  specialtyHit: boolean;
  /** Product of every modifier's multiplier (1 when none). */
  modifierMultiplier: number;
  modifiers: SimModifier[];
}

export interface SideRating {
  sideId: string;
  rating: number;
  /** Mean of the members' ratings, before the style edge. */
  memberMean: number;
  /** Net style edge in [-1, 1]. */
  styleEdge: number;
}

export interface SideProbability {
  sideId: string;
  /** 0–1; all sides sum to 1. */
  probability: number;
}

export interface SimResult {
  /** The normalized seed used for the draw. */
  seed: number;
  category: SimCategory;
  /** In the order of the given sides. */
  probabilities: SideProbability[];
  winnerSideId: string;
  /** Side ratings in the order of the given sides. */
  ratings: SideRating[];
  competitors: CompetitorRating[];
  /** Player ids fighting in their specialty (for the GM preview). */
  specialtyHits: string[];
  /** Short hash of the inputs and rules version: same digest + seed = same result. */
  inputsDigest: string;
  rulesVersion: number;
}

// ─── Seeded random numbers ──────────────────────────────────────────

/** Unsigned 32-bit seed from any number (NaN / Infinity → 0). */
export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 0;
  return Math.trunc(seed) >>> 0;
}

/**
 * mulberry32: a small, fast seeded PRNG returning floats in [0, 1). The draw
 * uses the first value of `createRng(seed)`; other consumers (play-by-play)
 * should use `createRng(deriveSeed(seed, stream))` so they never shift the
 * draw.
 */
export function createRng(seed: number): () => number {
  let state = normalizeSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed for a separate stream derived from the sim seed, e.g. play-by-play = 1. */
export function deriveSeed(seed: number, stream: number): number {
  return (normalizeSeed(seed) + Math.imul(normalizeSeed(stream), 0x9e3779b1)) >>> 0;
}

// ─── Ratings ────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function levelScore(level: number): number {
  const clamped = clamp(level, MOVE_LEVEL_MIN, MOVE_LEVEL_MAX);
  return ((clamped - MOVE_LEVEL_MIN) / (MOVE_LEVEL_MAX - MOVE_LEVEL_MIN)) * 100;
}

/**
 * 0–100 move score: best finisher level × 60% + average signature level ×
 * 40%, with level 1 = 0 and MOVE_LEVEL_MAX = 100. No moves count as level 1.
 */
export function moveScore(
  signatureLevels: readonly number[],
  finisherLevels: readonly number[],
): number {
  const bestFinisher = finisherLevels.length > 0 ? Math.max(...finisherLevels) : MOVE_LEVEL_MIN;
  const averageSignature =
    signatureLevels.length > 0
      ? signatureLevels.reduce((sum, level) => sum + level, 0) / signatureLevels.length
      : MOVE_LEVEL_MIN;
  return FINISHER_SHARE * levelScore(bestFinisher) + (1 - FINISHER_SHARE) * levelScore(averageSignature);
}

/** Weighted stat sum for the category (stats are on the 40–100 scale). */
export function weightedStats(stats: Record<CoreStat, number>, category: SimCategory): number {
  const weights = STAT_WEIGHTS_BY_CATEGORY[category] ?? STAT_WEIGHTS_DEFAULT;
  return CORE_STATS.reduce((sum, stat) => sum + weights[stat] * (stats[stat] ?? 0), 0);
}

/** True when the competitor fights in their specialty (`standard` never counts). */
export function isSpecialtyHit(competitor: Pick<SimCompetitor, 'specialty'>, category: SimCategory): boolean {
  return category !== 'standard' && competitor.specialty === category;
}

/** The competitor's rating with its parts, before the side's style edge. */
export function rateCompetitor(
  competitor: SimCompetitor,
  category: SimCategory,
  sideId = '',
): CompetitorRating {
  const baseRating =
    weightedStats(competitor.effectiveStats, category) +
    MOVE_WEIGHT * moveScore(competitor.signatureLevels, competitor.finisherLevels) +
    FORM_WEIGHT * clamp(competitor.form, 0, 100);
  const specialtyHit = isSpecialtyHit(competitor, category);
  const specialtyMultiplier = specialtyHit ? 1 + specialtyBonusFor(competitor.style) : 1;
  const modifiers = (competitor.modifiers ?? []).map((modifier) => ({
    source: modifier.source,
    multiplier: Math.max(0, Number.isFinite(modifier.multiplier) ? modifier.multiplier : 1),
  }));
  const modifierMultiplier = modifiers.reduce((product, modifier) => product * modifier.multiplier, 1);
  return {
    playerId: competitor.playerId,
    sideId,
    rating: baseRating * specialtyMultiplier * modifierMultiplier,
    baseRating,
    specialtyHit,
    modifierMultiplier,
    modifiers,
  };
}

/** The competitor's rating: weighted stats + moves + form, × specialty bonus, × modifiers. */
export function competitorRating(competitor: SimCompetitor, category: SimCategory): number {
  return rateCompetitor(competitor, category).rating;
}

/**
 * Net style edge of `side` against every member of every other side: +1 per
 * pairing its member's style beats, −1 per pairing it loses, averaged over
 * all pairings. allRounder pairings are 0.
 */
export function netStyleEdge(side: SimSide, opponents: readonly SimSide[]): number {
  let total = 0;
  let pairings = 0;
  for (const member of side.members) {
    for (const opponentSide of opponents) {
      if (opponentSide === side) continue;
      for (const opponent of opponentSide.members) {
        total += styleMatchup(member.style, opponent.style);
        pairings += 1;
      }
    }
  }
  return pairings === 0 ? 0 : total / pairings;
}

function rateSide(side: SimSide, sides: readonly SimSide[], memberRatings: readonly number[]): SideRating {
  const memberMean =
    memberRatings.length === 0
      ? 0
      : memberRatings.reduce((sum, rating) => sum + rating, 0) / memberRatings.length;
  const styleEdge = netStyleEdge(side, sides);
  return { sideId: side.sideId, rating: memberMean * (1 + STYLE_EDGE * styleEdge), memberMean, styleEdge };
}

/** A side's rating: the mean of its members × (1 + STYLE_EDGE × net style edge). */
export function sideRating(side: SimSide, sides: readonly SimSide[], category: SimCategory): number {
  const memberRatings = side.members.map((member) => competitorRating(member, category));
  return rateSide(side, sides, memberRatings).rating;
}

// ─── Odds ───────────────────────────────────────────────────────────

/**
 * Win chances from side ratings: softmax of rating / TEMPERATURE, then every
 * side below MIN_WIN_CHANCE is lifted to it and the others share the rest in
 * proportion. Sums to 1. Works for any number of sides.
 */
export function probabilitiesFromRatings(ratings: readonly number[]): number[] {
  const count = ratings.length;
  if (count === 0) return [];
  if (count * MIN_WIN_CHANCE >= 1) return ratings.map(() => 1 / count);

  const top = Math.max(...ratings);
  const weights = ratings.map((rating) => Math.exp((rating - top) / TEMPERATURE));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const softmax = weights.map((weight) => weight / weightSum);

  // Lift sides under the floor, then rescale the rest; repeat because the
  // rescale can push another side under the floor.
  const floored = new Set<number>();
  for (;;) {
    const freeMass = 1 - floored.size * MIN_WIN_CHANCE;
    const freeSum = softmax.reduce((sum, chance, index) => (floored.has(index) ? sum : sum + chance), 0);
    let changed = false;
    softmax.forEach((chance, index) => {
      if (!floored.has(index) && (chance / freeSum) * freeMass < MIN_WIN_CHANCE) {
        floored.add(index);
        changed = true;
      }
    });
    if (!changed) {
      return softmax.map((chance, index) =>
        floored.has(index) ? MIN_WIN_CHANCE : (chance / freeSum) * freeMass,
      );
    }
  }
}

function validateSides(sides: readonly SimSide[]): void {
  if (sides.length < 2) throw new RangeError('A sim needs at least two sides');
  const seen = new Set<string>();
  for (const side of sides) {
    if (seen.has(side.sideId)) throw new RangeError(`Duplicate sideId "${side.sideId}"`);
    seen.add(side.sideId);
    if (side.members.length === 0) throw new RangeError(`Side "${side.sideId}" has no members`);
  }
}

interface RatedSides {
  competitors: CompetitorRating[];
  ratings: SideRating[];
}

function rateSides(sides: readonly SimSide[], category: SimCategory): RatedSides {
  const competitors: CompetitorRating[] = [];
  const ratings = sides.map((side) => {
    const rated = side.members.map((member) => rateCompetitor(member, category, side.sideId));
    competitors.push(...rated);
    return rateSide(side, sides, rated.map((entry) => entry.rating));
  });
  return { competitors, ratings };
}

/** Each side's chance to win, in the order of `sides`. */
export function winProbabilities(sides: readonly SimSide[], category: SimCategory): SideProbability[] {
  validateSides(sides);
  const { ratings } = rateSides(sides, category);
  const chances = probabilitiesFromRatings(ratings.map((entry) => entry.rating));
  return ratings.map((entry, index) => ({ sideId: entry.sideId, probability: chances[index] }));
}

// ─── Digest ─────────────────────────────────────────────────────────

/**
 * Short stable hash of everything that decides the odds: the category, rules
 * version and every competitor's inputs, in side order.
 */
export function simInputsDigest(sides: readonly SimSide[], category: SimCategory): string {
  const canonical = {
    rulesVersion: RULES_VERSION,
    category,
    sides: sides.map((side) => ({
      sideId: side.sideId,
      members: side.members.map((member) => ({
        playerId: member.playerId,
        style: member.style,
        specialty: member.specialty ?? null,
        stats: CORE_STATS.map((stat) => member.effectiveStats[stat]),
        signatureLevels: [...member.signatureLevels],
        finisherLevels: [...member.finisherLevels],
        form: member.form,
        modifiers: (member.modifiers ?? []).map((modifier) => [modifier.source, modifier.multiplier]),
      })),
    })),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 16);
}

// ─── Simulate ───────────────────────────────────────────────────────

/** Index picked by `roll` (in [0, 1)) over cumulative `chances`. */
export function pickByRoll(chances: readonly number[], roll: number): number {
  let cumulative = 0;
  for (let index = 0; index < chances.length; index += 1) {
    cumulative += chances[index];
    if (roll < cumulative) return index;
  }
  return chances.length - 1;
}

/**
 * Run the sim. Deterministic: the same sides, category and seed always give
 * the same winner. Throws RangeError for fewer than two sides, an empty side
 * or duplicate side ids. Never produces a draw (v1).
 */
export function simulate(sides: readonly SimSide[], options: SimOptions): SimResult {
  validateSides(sides);
  const seed = normalizeSeed(options.seed);
  const { category } = options;
  const { competitors, ratings } = rateSides(sides, category);
  const chances = probabilitiesFromRatings(ratings.map((entry) => entry.rating));
  const roll = createRng(seed)();
  const winnerIndex = pickByRoll(chances, roll);

  return {
    seed,
    category,
    probabilities: ratings.map((entry, index) => ({ sideId: entry.sideId, probability: chances[index] })),
    winnerSideId: sides[winnerIndex].sideId,
    ratings,
    competitors,
    specialtyHits: competitors.filter((entry) => entry.specialtyHit).map((entry) => entry.playerId),
    inputsDigest: simInputsDigest(sides, category),
    rulesVersion: RULES_VERSION,
  };
}

// ─── Helpers for the input loader ───────────────────────────────────

/** Build a `SimCompetitor` from an `effectiveBuild` result (BLD-02) and a form score. */
export function competitorFromBuild(
  playerId: string,
  build: Pick<EffectiveBuild, 'style' | 'specialty' | 'stats' | 'signatureLevels' | 'finisherLevels'>,
  form: number = NEUTRAL_FORM,
  modifiers?: readonly SimModifier[],
): SimCompetitor {
  const competitor: SimCompetitor = {
    playerId,
    style: build.style,
    effectiveStats: { ...build.stats },
    signatureLevels: [...build.signatureLevels],
    finisherLevels: [...build.finisherLevels],
    form,
  };
  if (build.specialty !== undefined) competitor.specialty = build.specialty;
  if (modifiers && modifiers.length > 0) competitor.modifiers = [...modifiers];
  return competitor;
}
