/**
 * Stamina and injury math (INJ-02). Pure and deterministic: every number
 * comes from `InjuryTunables` (INJ-01, `fatigueDefaults.ts`), and injury
 * rolls use the sim's seeded PRNG so the same match, player and tunables
 * version always give the same outcome.
 *
 * Consumers: INJ-04 (drain + roll when a result is recorded), INJ-05 (weekly
 * recovery), INJ-09 (sim penalties), ECO-10 (injury shield chance reduction).
 */

import { STAT_CAP, type SimCategory } from './buildRules';
import {
  ENDURANCE_BASELINE,
  ENDURANCE_REDUCTION_RANGE,
  type InjurySeverityKey,
  type InjuryTunables,
} from './fatigueDefaults';
import { createRng, deriveSeed } from './matchSim';
import { leagueWeekOf } from '../leagueWeek';

/** Injury chance never goes above this, whatever the band and category risk. */
export const MAX_INJURY_CHANCE = 0.95;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** PRNG streams derived from the roll seed, so each draw is independent of the others. */
const SEVERITY_STREAM = 1;
const WEEKS_STREAM = 2;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

// ─── Stamina ────────────────────────────────────────────────────────

/** A player's stamina, clamped to [0, maxStamina]. No stored value means full stamina. */
export function staminaOf(stored: number | undefined | null, tunables: Pick<InjuryTunables, 'maxStamina'>): number {
  if (stored === undefined || stored === null) return tunables.maxStamina;
  return clamp(stored, 0, tunables.maxStamina);
}

// ─── Match format ───────────────────────────────────────────────────

/** The match fields the format key depends on. */
export interface FatigueFormatMatch {
  matchFormat?: string;
  /** Legacy name of `matchFormat`. */
  matchType?: string;
  participants?: readonly string[];
  teams?: readonly (readonly string[])[];
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The `formatMultiplier` key for a match.
 *
 * 1. A tunables key whose name equals the match format (ignoring case and
 *    punctuation) wins, so a GM can add e.g. `ladder` and have it apply.
 * 2. Otherwise the built-in keys: `battleRoyal` (battle royal / rumble by
 *    name), `tag` (any team of two or more, or "tag" / "N-man" in the name),
 *    `multiPerson` (more than two sides), `singles` (two sides).
 * 3. `undefined` when nothing is known; `formatMultiplierFor` then uses 1.
 */
export function formatKeyForMatch(match: FatigueFormatMatch, tunables?: Pick<InjuryTunables, 'formatMultiplier'>): string | undefined {
  const formatName = normalizeName(match.matchFormat ?? match.matchType ?? '');

  if (formatName && tunables) {
    const configured = Object.keys(tunables.formatMultiplier).find((key) => normalizeName(key) === formatName);
    if (configured) return configured;
  }

  if (formatName.includes('battleroyal') || formatName.includes('royalrumble') || formatName.includes('rumble')) {
    return 'battleRoyal';
  }

  const teams = (match.teams ?? []).filter((team) => team.length > 0);
  if (teams.some((team) => team.length > 1) || formatName.includes('tag') || /\dman/.test(formatName)) {
    return 'tag';
  }

  const sides = teams.length > 0 ? teams.length : (match.participants?.length ?? 0);
  if (sides > 2) return 'multiPerson';
  if (sides === 2) return 'singles';

  if (formatName.includes('single')) return 'singles';
  if (formatName.includes('triplethreat') || formatName.includes('fatal') || formatName.includes('4way')) {
    return 'multiPerson';
  }
  return undefined;
}

/** The drain multiplier for a format key; unknown or missing keys use 1. */
export function formatMultiplierFor(format: string | undefined, tunables: Pick<InjuryTunables, 'formatMultiplier'>): number {
  if (!format) return 1;
  const multiplier = tunables.formatMultiplier[format];
  return typeof multiplier === 'number' && Number.isFinite(multiplier) && multiplier >= 0 ? multiplier : 1;
}

// ─── Drain ──────────────────────────────────────────────────────────

export interface MatchDrainInput {
  category: SimCategory;
  /** A `formatMultiplier` key (see `formatKeyForMatch`); unknown or missing = 1. */
  format?: string;
  /** Effective build endurance (`effectiveBuild`); missing = the base ENDURANCE_BASELINE. */
  endurance?: number;
}

/**
 * Stamina one match takes from one participant, an integer ≥ 0:
 * drainByCategory × formatMultiplier × (1 − k × (endurance − base) / range).
 */
export function matchDrain(input: MatchDrainInput, tunables: InjuryTunables): number {
  const base = tunables.drainByCategory[input.category] ?? 0;
  const endurance = clamp(input.endurance ?? ENDURANCE_BASELINE, 0, STAT_CAP);
  const enduranceFactor = Math.max(
    0,
    1 - tunables.enduranceDrainReduction * ((endurance - ENDURANCE_BASELINE) / ENDURANCE_REDUCTION_RANGE),
  );
  const drain = base * formatMultiplierFor(input.format, tunables) * enduranceFactor;
  return Math.max(0, Math.round(drain));
}

/** Stamina after a drain, clamped to [0, maxStamina]. */
export function applyDrain(stamina: number, drain: number, tunables: Pick<InjuryTunables, 'maxStamina'>): number {
  return clamp(stamina - Math.max(0, drain), 0, tunables.maxStamina);
}

// ─── Injury chance ──────────────────────────────────────────────────

export interface InjuryChanceOptions {
  /**
   * Fraction in [0, 1] taken off the final chance, e.g. the shop's injury
   * shield (ECO-10, `Player.effects.injuryShield.reduction`). Applied after
   * the MAX_INJURY_CHANCE cap. It changes only the chance, never the roll.
   */
  chanceReduction?: number;
}

/**
 * Injury chance for a participant: the first band (highest first) whose
 * `minStamina` ≤ staminaAfter, × categoryRisk, capped at MAX_INJURY_CHANCE,
 * then reduced by `chanceReduction`.
 */
export function injuryChance(
  staminaAfter: number,
  category: SimCategory,
  tunables: InjuryTunables,
  options: InjuryChanceOptions = {},
): number {
  const bands = [...tunables.injuryChanceBands].sort((a, b) => b.minStamina - a.minStamina);
  const band = bands.find((item) => item.minStamina <= staminaAfter) ?? bands[bands.length - 1];
  if (!band) return 0;
  const risk = tunables.categoryRisk[category] ?? 1;
  const capped = Math.min(MAX_INJURY_CHANCE, Math.max(0, band.chance * risk));
  const reduction = clamp(options.chanceReduction ?? 0, 0, 1);
  return capped * (1 - reduction);
}

// ─── Seeded roll ────────────────────────────────────────────────────

/** FNV-1a over UTF-16 code units: a stable unsigned 32-bit hash. */
function hash32(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * The injury roll seed for one participant of one match under one tunables
 * version: a stable 32-bit hash, so a re-recorded result rolls the same.
 */
export function rollSeed(matchId: string, playerId: string, version: number): number {
  return hash32(`injury|${matchId}|${playerId}|${version}`);
}

/**
 * Severity weights after the low-stamina shift. Below
 * `lowStaminaSeverityShift`, each severity's weight is multiplied by
 * 1 + depth × rank, where rank is its position (mildest = 0) and depth goes
 * from 0 at the threshold to 1 at 0 stamina. So at 0 stamina with the
 * defaults, minor 60 / moderate 60 / major 30.
 */
export function severityWeights(staminaAfter: number, tunables: InjuryTunables): number[] {
  const threshold = tunables.lowStaminaSeverityShift;
  const depth = threshold > 0 && staminaAfter < threshold
    ? clamp((threshold - staminaAfter) / threshold, 0, 1)
    : 0;
  return tunables.severities.map((severity, rank) => Math.max(0, severity.weight) * (1 + depth * rank));
}

function pickWeighted(weights: readonly number[], roll: number): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return 0;
  let cumulative = 0;
  for (let index = 0; index < weights.length; index += 1) {
    cumulative += weights[index] / total;
    if (roll < cumulative) return index;
  }
  return weights.length - 1;
}

export interface InjuryRoll {
  /** Final chance used, after category risk, cap and any reduction. */
  chance: number;
  /** The uniform draw in [0, 1); injured when roll < chance. */
  roll: number;
  injured: boolean;
  severity?: InjurySeverityKey;
  /** Weeks out, uniform within the severity's [minWeeks, maxWeeks]. */
  weeks?: number;
}

/**
 * Rolls for an injury. The chance draw is the first value of
 * `createRng(seed)`; severity and weeks use derived streams, so they never
 * change the chance draw.
 */
export function rollInjury(
  staminaAfter: number,
  category: SimCategory,
  seed: number,
  tunables: InjuryTunables,
  options: InjuryChanceOptions = {},
): InjuryRoll {
  const chance = injuryChance(staminaAfter, category, tunables, options);
  const roll = createRng(seed)();
  const injured = roll < chance;
  if (!injured || tunables.severities.length === 0) return { chance, roll, injured };

  const severityIndex = pickWeighted(severityWeights(staminaAfter, tunables), createRng(deriveSeed(seed, SEVERITY_STREAM))());
  const severity = tunables.severities[severityIndex];
  const minWeeks = Math.min(severity.minWeeks, severity.maxWeeks);
  const maxWeeks = Math.max(severity.minWeeks, severity.maxWeeks);
  const span = maxWeeks - minWeeks + 1;
  const weeks = minWeeks + Math.min(span - 1, Math.floor(createRng(deriveSeed(seed, WEEKS_STREAM))() * span));
  return { chance, roll, injured, severity: severity.key, weeks };
}

// ─── Return date ────────────────────────────────────────────────────

/**
 * When an injury ends: the first league week boundary (Sunday 00:00 in
 * `timezone`) at or after `weeks` full weeks from `injuredAt`. Injuries
 * always end on a weekly reset, and the player misses at least `weeks` weeks.
 */
export function returnDate(injuredAt: Date | string, weeks: number, timezone: string): Date {
  const injuredInstant = new Date(injuredAt);
  const fullWeeks = Math.max(0, Math.trunc(weeks));
  const injuryWeekStart = leagueWeekOf(injuredInstant, timezone).weekStart;
  const weeksAhead = injuredInstant.getTime() === injuryWeekStart.getTime() ? fullWeeks : fullWeeks + 1;
  // Land in the middle of the target week, then snap to its start: robust to DST hours.
  const insideTargetWeek = new Date(injuryWeekStart.getTime() + weeksAhead * WEEK_MS + DAY_MS / 2);
  return leagueWeekOf(insideTargetWeek, timezone).weekStart;
}

// ─── Recovery and sim ───────────────────────────────────────────────

/** Stamina after the weekly Sunday recovery: full, or +N capped at maxStamina. */
export function recover(stamina: number, tunables: Pick<InjuryTunables, 'maxStamina' | 'weeklyRecovery'>): number {
  if (tunables.weeklyRecovery === 'full') return tunables.maxStamina;
  return clamp(stamina + Math.max(0, tunables.weeklyRecovery), 0, tunables.maxStamina);
}

/**
 * Sim rating multiplier: linear from `simStaminaFloor` at 0 stamina to 1 at
 * maxStamina, × `simInjuredPenalty` when injured.
 */
export function staminaSimMultiplier(stamina: number, injured: boolean, tunables: InjuryTunables): number {
  const share = tunables.maxStamina > 0 ? clamp(stamina, 0, tunables.maxStamina) / tunables.maxStamina : 1;
  const staminaFactor = tunables.simStaminaFloor + (1 - tunables.simStaminaFloor) * share;
  return injured ? staminaFactor * tunables.simInjuredPenalty : staminaFactor;
}
