/**
 * Play-by-play generator (BLD-06).
 *
 * Turns a sim result (BLD-05) into a short match story of 6–8 beats that uses
 * each wrestler's real move names and always ends with the winner. Beats are
 * i18n keys plus params, never text: the frontend renders them from
 * `sim.beats.*` in EN and DE.
 *
 * Story shape:
 *   opening → 2–4 momentum beats → signature → (kick-out, close matches only)
 *   → the winner's finisher → finish (pin, or a submission for technicians and
 *   grapple-first builds).
 *
 * Momentum beats favour the side with the better odds and use the attacker's
 * top-weighted stat (stat × the category's weight) to pick the beat pool.
 * A match is "close" when the two best win chances are within
 * CLOSE_MATCH_MARGIN; only then does the story include a near-fall or a
 * finisher kick-out.
 *
 * Randomness comes from its own stream, `createRng(deriveSeed(seed,
 * PLAY_BY_PLAY_STREAM))`, so the story never shifts the draw and the same
 * result always replays to the same story.
 */
import type { WrestlerMove } from '../repositories/types';
import { CORE_STATS, type CoreStat } from '../policies/buildRules';
import {
  STAT_WEIGHTS_BY_CATEGORY,
  STAT_WEIGHTS_DEFAULT,
  createRng,
  deriveSeed,
  type SimCompetitor,
  type SimResult,
  type SimSide,
} from '../policies/matchSim';

// ─── Tunables ───────────────────────────────────────────────────────

/** RNG stream id for the play-by-play (the draw itself uses the raw seed). */
export const PLAY_BY_PLAY_STREAM = 1;
/** Two best win chances within this (0–1) make a match "close": kick-out beat. */
export const CLOSE_MATCH_MARGIN = 0.15;
export const MIN_MOMENTUM_BEATS = 2;
export const MAX_MOMENTUM_BEATS = 4;
/** Close matches get one fewer momentum beat at most, so a story stays ≤ 8 beats. */
export const MAX_MOMENTUM_BEATS_CLOSE = 3;
/**
 * Share of a momentum beat's side pick that follows the odds; the rest is
 * uniform so the underdog still gets some offence.
 */
export const MOMENTUM_ODDS_SHARE = 0.6;
/** A winner whose top effective stat is grapple at or above this finishes by submission. */
export const SUBMISSION_GRAPPLE_MIN = 75;

/**
 * Number of text variants per beat type under `sim.beats.<type>.v1..vN`.
 * The frontend locale files must provide every one of them.
 */
export const BEAT_VARIANTS = {
  opening: 3,
  openingTag: 3,
  openingMulti: 3,
  momentumStrikes: 3,
  momentumGrapple: 3,
  momentumAgility: 3,
  momentumEndurance: 3,
  signature: 3,
  signatureGeneric: 3,
  nearFall: 3,
  finisherKickout: 3,
  finisher: 3,
  finisherGeneric: 3,
  finishPin: 3,
  finishSubmission: 3,
} as const;
export type BeatType = keyof typeof BEAT_VARIANTS;

const MOMENTUM_BEAT_BY_STAT: Readonly<Record<CoreStat, BeatType>> = {
  strikes: 'momentumStrikes',
  grapple: 'momentumGrapple',
  agility: 'momentumAgility',
  endurance: 'momentumEndurance',
};

/** Beat types that mean someone survived a big moment (close matches only). */
export const KICKOUT_BEAT_TYPES: readonly BeatType[] = ['nearFall', 'finisherKickout'];

// ─── Types ──────────────────────────────────────────────────────────

/**
 * One line of the story: an i18n key (`sim.beats.<type>.v<n>`) and its
 * interpolation params (`wrestler`, `opponent`, optionally `move`).
 */
export interface SimBeat {
  key: string;
  params: Record<string, string>;
}

/** A wrestler's moveset as stored on the player (BLD-03). */
export interface PlayByPlayMoveset {
  signatures?: readonly WrestlerMove[];
  finishers?: readonly WrestlerMove[];
}

/** Display names by playerId (wrestler name, falling back to the player name). */
export type PlayByPlayNames = Readonly<Record<string, string>>;
/** Movesets by playerId. Missing entries mean no moves (generic beats). */
export type PlayByPlayMoves = Readonly<Record<string, PlayByPlayMoveset | undefined>>;

type Rng = () => number;

// ─── Helpers ────────────────────────────────────────────────────────

/** The beat key for `type`, variant picked by `rng`. */
export function beatKey(type: BeatType, rng: Rng): string {
  const variant = Math.floor(rng() * BEAT_VARIANTS[type]) + 1;
  return `sim.beats.${type}.v${Math.min(variant, BEAT_VARIANTS[type])}`;
}

/** The type part of a beat key, e.g. `finishPin` for `sim.beats.finishPin.v2`. */
export function beatTypeOf(beat: SimBeat): string {
  return beat.key.split('.')[2] ?? '';
}

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

function pickWeighted<T>(items: readonly T[], weights: readonly number[], rng: Rng): T {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (total <= 0) return pick(items, rng);
  let roll = rng() * total;
  for (let index = 0; index < items.length; index += 1) {
    roll -= Math.max(0, weights[index]);
    if (roll < 0) return items[index];
  }
  return items[items.length - 1];
}

/** Commentary name of a move: the custom name, falling back to the game name. */
export function moveDisplayName(move: WrestlerMove): string {
  return move.customName.trim() || move.gameName.trim();
}

function usableMoves(moves: readonly WrestlerMove[] | undefined): WrestlerMove[] {
  return (moves ?? []).filter((move) => moveDisplayName(move).length > 0);
}

/** The competitor's stat with the biggest stat × category weight (ties: CORE_STATS order). */
export function topWeightedStat(competitor: SimCompetitor, result: Pick<SimResult, 'category'>): CoreStat {
  const weights = STAT_WEIGHTS_BY_CATEGORY[result.category] ?? STAT_WEIGHTS_DEFAULT;
  let best: CoreStat = CORE_STATS[0];
  let bestScore = -Infinity;
  for (const stat of CORE_STATS) {
    const score = weights[stat] * (competitor.effectiveStats[stat] ?? 0);
    if (score > bestScore) {
      best = stat;
      bestScore = score;
    }
  }
  return best;
}

/** True for technicians and builds whose best raw stat is a high grapple. */
export function finishesBySubmission(competitor: SimCompetitor): boolean {
  if (competitor.style === 'technician') return true;
  const grapple = competitor.effectiveStats.grapple ?? 0;
  if (grapple < SUBMISSION_GRAPPLE_MIN) return false;
  return CORE_STATS.every((stat) => (competitor.effectiveStats[stat] ?? 0) <= grapple);
}

/** True when the two best win chances are within CLOSE_MATCH_MARGIN. */
export function isCloseMatch(result: Pick<SimResult, 'probabilities'>): boolean {
  const chances = result.probabilities.map((entry) => entry.probability).sort((a, b) => b - a);
  if (chances.length < 2) return false;
  return chances[0] - chances[1] <= CLOSE_MATCH_MARGIN + 1e-9;
}

// ─── Generator ──────────────────────────────────────────────────────

/**
 * Build the play-by-play for `result`. `sides` must be the sides passed to
 * `simulate`. `rng` defaults to the play-by-play stream of the result's seed;
 * pass one only to override it (tests).
 *
 * Guarantees: deterministic for the same inputs; the last beat's `wrestler` is
 * on the winning side; a move is only ever named for the wrestler who owns
 * it; kick-out beats appear only in close matches.
 */
export function buildPlayByPlay(
  result: SimResult,
  sides: readonly SimSide[],
  names: PlayByPlayNames,
  moves: PlayByPlayMoves,
  rng: Rng = createRng(deriveSeed(result.seed, PLAY_BY_PLAY_STREAM)),
): SimBeat[] {
  const winnerSide = sides.find((side) => side.sideId === result.winnerSideId);
  if (!winnerSide || sides.length < 2) return [];
  const loserSides = sides.filter((side) => side !== winnerSide);
  const isClose = isCloseMatch(result);

  const nameOf = (competitor: SimCompetitor): string => names[competitor.playerId] ?? competitor.playerId;
  const opponentOf = (side: SimSide): SimCompetitor =>
    pick(sides.filter((other) => other !== side).flatMap((other) => other.members), rng);
  const beat = (type: BeatType, params: Record<string, string>): SimBeat => ({
    key: beatKey(type, rng),
    params,
  });
  const pair = (attacker: SimCompetitor, defender: SimCompetitor): Record<string, string> => ({
    wrestler: nameOf(attacker),
    opponent: nameOf(defender),
  });

  const chanceBySide = new Map(result.probabilities.map((entry) => [entry.sideId, entry.probability]));
  const sideWeights = sides.map(
    (side) =>
      MOMENTUM_ODDS_SHARE * (chanceBySide.get(side.sideId) ?? 0) + (1 - MOMENTUM_ODDS_SHARE) / sides.length,
  );

  const beats: SimBeat[] = [];

  // Opening.
  const openerSide = pick(sides, rng);
  const opener = pick(openerSide.members, rng);
  const openingType: BeatType =
    sides.length > 2 ? 'openingMulti' : sides.some((side) => side.members.length > 1) ? 'openingTag' : 'opening';
  beats.push(beat(openingType, pair(opener, opponentOf(openerSide))));

  // Momentum.
  const maxMomentum = isClose ? MAX_MOMENTUM_BEATS_CLOSE : MAX_MOMENTUM_BEATS;
  const momentumCount = MIN_MOMENTUM_BEATS + Math.floor(rng() * (maxMomentum - MIN_MOMENTUM_BEATS + 1));
  for (let index = 0; index < momentumCount; index += 1) {
    const side = pickWeighted(sides, sideWeights, rng);
    const attacker = pick(side.members, rng);
    beats.push(beat(MOMENTUM_BEAT_BY_STAT[topWeightedStat(attacker, result)], pair(attacker, opponentOf(side))));
  }

  // Signature.
  const signatureSide = pickWeighted(sides, sideWeights, rng);
  const signatureUser = pick(signatureSide.members, rng);
  const signatures = usableMoves(moves[signatureUser.playerId]?.signatures);
  const signatureTarget = opponentOf(signatureSide);
  if (signatures.length > 0) {
    const move = pick(signatures, rng);
    beats.push(beat('signature', { ...pair(signatureUser, signatureTarget), move: moveDisplayName(move) }));
  } else {
    beats.push(beat('signatureGeneric', pair(signatureUser, signatureTarget)));
  }

  // The winner's closer: the member who hits the finisher and scores the fall.
  const closer = pick(winnerSide.members, rng);

  // Kick-out (close matches only): the strongest losing side nearly steals it.
  if (isClose) {
    const challengerSide = loserSides.reduce((best, side) =>
      (chanceBySide.get(side.sideId) ?? 0) > (chanceBySide.get(best.sideId) ?? 0) ? side : best,
    );
    const challenger = pick(challengerSide.members, rng);
    const finishers = usableMoves(moves[challenger.playerId]?.finishers);
    if (finishers.length > 0 && rng() < 0.5) {
      const move = pick(finishers, rng);
      beats.push(beat('finisherKickout', { ...pair(challenger, closer), move: moveDisplayName(move) }));
    } else {
      beats.push(beat('nearFall', pair(challenger, closer)));
    }
  }

  // The winner's finisher and the finish.
  const victim = pick(loserSides.flatMap((side) => side.members), rng);
  const finishers = usableMoves(moves[closer.playerId]?.finishers);
  if (finishers.length > 0) {
    const move = pick(finishers, rng);
    beats.push(beat('finisher', { ...pair(closer, victim), move: moveDisplayName(move) }));
  } else {
    beats.push(beat('finisherGeneric', pair(closer, victim)));
  }
  beats.push(beat(finishesBySubmission(closer) ? 'finishSubmission' : 'finishPin', pair(closer, victim)));

  return beats;
}
