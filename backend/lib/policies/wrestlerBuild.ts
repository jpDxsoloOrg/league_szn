/**
 * Wrestler build policy (BLD-02): price a build, check it against a budget
 * and the style rules, and produce the "effective" build the sim uses.
 *
 * Pure functions only. Every number comes from `buildRules.ts`.
 *
 * - Stat cost: each point above STAT_BASE costs build points by band.
 * - Move cost: each signature / finisher level above 1 costs
 *   SIGNATURE_LEVEL_COST / FINISHER_LEVEL_COST. A move without `level` is 1.
 * - The specialty is free, but it must be one the style allows.
 * - Over budget (e.g. after a relegation): the effective build scales every
 *   stat's bought points and every move's levels above 1 down by one shared
 *   factor, rounding down, so it fits. The saved build is never changed.
 */
import type { WrestlerBuild, WrestlerMove } from '../repositories/types';
import {
  CORE_STATS,
  FINISHER_LEVEL_COST,
  MOVE_LEVEL_MAX,
  MOVE_LEVEL_MIN,
  SIGNATURE_LEVEL_COST,
  STAT_BASE,
  STAT_CAP,
  STAT_COST_BANDS,
  STYLES,
  STYLE_IDS,
  allowedSpecialties,
  isSimCategory,
  isSpecialtyAllowed,
  isStyleId,
  type CoreStat,
  type SimCategory,
  type StyleId,
} from './buildRules';

/** Anything with an optional move level (a full `WrestlerMove` fits). */
export type LeveledMove = Pick<WrestlerMove, 'level'>;

export interface BuildMoves {
  signatures?: readonly LeveledMove[];
  finishers?: readonly LeveledMove[];
}

// ─── Costs ──────────────────────────────────────────────────────────

/**
 * Build points needed to raise a stat from STAT_BASE to `value`. Values at or
 * below base cost 0; values above the cap are priced as the cap. Fractions are
 * rounded down.
 */
export function statCost(value: number): number {
  const target = Math.min(Math.floor(value), STAT_CAP);
  let cost = 0;
  for (const band of STAT_COST_BANDS) {
    if (target < band.from) break;
    const pointsInBand = Math.min(target, band.to) - band.from + 1;
    cost += pointsInBand * band.costPerPoint;
  }
  return cost;
}

/** The level a move counts as: unset → MOVE_LEVEL_MIN. */
export function moveLevel(move: LeveledMove): number {
  return move.level ?? MOVE_LEVEL_MIN;
}

function levelsAboveMin(moves: readonly LeveledMove[] | undefined): number {
  return (moves ?? []).reduce(
    (sum, move) => sum + Math.max(0, moveLevel(move) - MOVE_LEVEL_MIN),
    0,
  );
}

/** Build points spent on move levels above 1. */
export function moveLevelCost(
  signatures: readonly LeveledMove[] | undefined,
  finishers: readonly LeveledMove[] | undefined,
): number {
  return (
    levelsAboveMin(signatures) * SIGNATURE_LEVEL_COST +
    levelsAboveMin(finishers) * FINISHER_LEVEL_COST
  );
}

/** Total build cost: stats plus move levels. The specialty is free. */
export function buildCost(
  build: Pick<WrestlerBuild, 'stats'>,
  signatures: readonly LeveledMove[] | undefined,
  finishers: readonly LeveledMove[] | undefined,
): number {
  const statsCost = CORE_STATS.reduce((sum, stat) => sum + statCost(build.stats[stat]), 0);
  return statsCost + moveLevelCost(signatures, finishers);
}

// ─── Budget ─────────────────────────────────────────────────────────

export interface BudgetStatus {
  cost: number;
  budget: number;
  /** Negative when over budget. */
  remaining: number;
  overBudget: boolean;
}

export function budgetStatus(cost: number, budget: number): BudgetStatus {
  return { cost, budget, remaining: budget - cost, overBudget: cost > budget };
}

// ─── Validation ─────────────────────────────────────────────────────

export type BuildValidationCode =
  | 'INVALID_STYLE'
  | 'INVALID_SPECIALTY'
  | 'SPECIALTY_NOT_ALLOWED'
  | 'INVALID_STATS'
  | 'MISSING_STAT'
  | 'UNKNOWN_STAT'
  | 'INVALID_STAT'
  | 'INVALID_MOVE_LEVEL'
  | 'OVER_BUDGET';

export interface BuildValidationError {
  code: BuildValidationCode;
  /** Path of the offending field, e.g. `stats.grapple` or `finishers[1].level`. */
  field: string;
  message: string;
  /** Extra data for the client, e.g. `{ cost, budget }` or `{ style, allowed }`. */
  details?: Record<string, unknown>;
}

/** A build as it arrives from a request: nothing is trusted yet. */
export interface BuildCandidate {
  style: unknown;
  specialty?: unknown;
  stats: unknown;
}

/** The validated build (no `updatedAt`; the caller stamps it on save). */
export type ValidBuild = Omit<WrestlerBuild, 'updatedAt'>;

export type BuildValidationResult =
  | { ok: true; build: ValidBuild; status: BudgetStatus }
  | { ok: false; errors: BuildValidationError[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateStats(
  stats: unknown,
  errors: BuildValidationError[],
): Record<CoreStat, number> | undefined {
  if (!isRecord(stats)) {
    errors.push({
      code: 'INVALID_STATS',
      field: 'stats',
      message: `stats must be an object with ${CORE_STATS.join(', ')}`,
    });
    return undefined;
  }
  const errorCountBefore = errors.length;
  for (const key of Object.keys(stats)) {
    if (!(CORE_STATS as readonly string[]).includes(key)) {
      errors.push({
        code: 'UNKNOWN_STAT',
        field: `stats.${key}`,
        message: `Unknown stat "${key}". Stats are ${CORE_STATS.join(', ')}`,
      });
    }
  }
  for (const stat of CORE_STATS) {
    const value = stats[stat];
    if (value === undefined) {
      errors.push({ code: 'MISSING_STAT', field: `stats.${stat}`, message: `${stat} is required` });
    } else if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < STAT_BASE ||
      value > STAT_CAP
    ) {
      errors.push({
        code: 'INVALID_STAT',
        field: `stats.${stat}`,
        message: `${stat} must be a whole number from ${STAT_BASE} to ${STAT_CAP}`,
        details: { min: STAT_BASE, max: STAT_CAP },
      });
    }
  }
  if (errors.length > errorCountBefore) return undefined;
  const valid = {} as Record<CoreStat, number>;
  for (const stat of CORE_STATS) valid[stat] = stats[stat] as number;
  return valid;
}

function validateMoveLevels(
  label: 'signatures' | 'finishers',
  moves: readonly LeveledMove[] | undefined,
  errors: BuildValidationError[],
): void {
  (moves ?? []).forEach((move, index) => {
    const level: unknown = move.level;
    if (level === undefined) return;
    if (
      typeof level !== 'number' ||
      !Number.isInteger(level) ||
      level < MOVE_LEVEL_MIN ||
      level > MOVE_LEVEL_MAX
    ) {
      errors.push({
        code: 'INVALID_MOVE_LEVEL',
        field: `${label}[${index}].level`,
        message: `Move levels must be whole numbers from ${MOVE_LEVEL_MIN} to ${MOVE_LEVEL_MAX}`,
        details: { min: MOVE_LEVEL_MIN, max: MOVE_LEVEL_MAX },
      });
    }
  });
}

function validateSpecialty(
  style: StyleId | undefined,
  specialty: unknown,
  errors: BuildValidationError[],
): SimCategory | undefined {
  if (specialty === undefined || specialty === null) return undefined;
  if (!isSimCategory(specialty)) {
    errors.push({
      code: 'INVALID_SPECIALTY',
      field: 'specialty',
      message: `Unknown match specialty "${String(specialty)}"`,
    });
    return undefined;
  }
  // Without a known style there is nothing to check the specialty against;
  // the style error already explains the problem.
  if (style === undefined) return undefined;
  if (!isSpecialtyAllowed(style, specialty)) {
    const allowed = allowedSpecialties(style);
    errors.push({
      code: 'SPECIALTY_NOT_ALLOWED',
      field: 'specialty',
      message: `A ${style} can't specialize in ${specialty} matches. Allowed: ${allowed.join(', ')}`,
      details: { style, specialty, allowed: [...allowed] },
    });
    return undefined;
  }
  return specialty;
}

/**
 * Check a build and its move levels against the rules and `budget`. Returns
 * every error at once. The budget is only checked when the stats and levels
 * are valid, since a cost of invalid values means nothing.
 */
export function validateBuild(
  build: BuildCandidate,
  moves: BuildMoves,
  budget: number,
): BuildValidationResult {
  const errors: BuildValidationError[] = [];

  let style: StyleId | undefined;
  if (isStyleId(build.style)) {
    style = build.style;
  } else {
    errors.push({
      code: 'INVALID_STYLE',
      field: 'style',
      message: `Unknown style "${String(build.style)}". Styles are ${STYLE_IDS.join(', ')}`,
      details: { allowed: [...STYLE_IDS] },
    });
  }

  const specialty = validateSpecialty(style, build.specialty, errors);
  const stats = validateStats(build.stats, errors);

  const levelErrorsBefore = errors.length;
  validateMoveLevels('signatures', moves.signatures, errors);
  validateMoveLevels('finishers', moves.finishers, errors);
  const levelsValid = errors.length === levelErrorsBefore;

  let status: BudgetStatus | undefined;
  if (stats && levelsValid) {
    status = budgetStatus(buildCost({ stats }, moves.signatures, moves.finishers), budget);
    if (status.overBudget) {
      errors.push({
        code: 'OVER_BUDGET',
        field: 'stats',
        message: `This build costs ${status.cost} points but the budget is ${budget}`,
        details: { cost: status.cost, budget },
      });
    }
  }

  if (errors.length > 0 || !style || !stats || !status) return { ok: false, errors };
  const valid: ValidBuild = { style, stats };
  if (specialty) valid.specialty = specialty;
  return { ok: true, build: valid, status };
}

// ─── Effective build ────────────────────────────────────────────────

export interface EffectiveBuild {
  style: StyleId;
  specialty?: SimCategory;
  /** Stats the sim uses: scaled to the budget, plus the style bonus, capped at STAT_CAP. */
  stats: Record<CoreStat, number>;
  /** Stats after scaling, before the style bonus. Equal to the saved stats when within budget. */
  spentStats: Record<CoreStat, number>;
  /** Levels after scaling, in the order of the given moves. */
  signatureLevels: number[];
  finisherLevels: number[];
  /** True when the saved build was over budget and has been scaled down. */
  scaled: boolean;
  status: BudgetStatus;
}

function clampInt(value: number, min: number, max: number): number {
  const whole = Number.isFinite(value) ? Math.floor(value) : min;
  return Math.min(max, Math.max(min, whole));
}

function scaleAbove(value: number, floor: number, factor: number): number {
  return floor + Math.floor((value - floor) * factor);
}

/**
 * The build the sim uses. Within budget: the saved stats plus the style
 * bonus. Over budget: bought stat points and move levels above 1 are all
 * scaled by one factor (rounded down) so the cost fits, then the bonus is
 * added. Out-of-range stored values are clamped first. The specialty passes
 * through unchanged.
 */
export function effectiveBuild(
  build: WrestlerBuild,
  moves: BuildMoves,
  budget: number,
): EffectiveBuild {
  const savedStats = {} as Record<CoreStat, number>;
  for (const stat of CORE_STATS) {
    savedStats[stat] = clampInt(build.stats?.[stat] ?? STAT_BASE, STAT_BASE, STAT_CAP);
  }
  const savedSignatureLevels = (moves.signatures ?? []).map((move) =>
    clampInt(moveLevel(move), MOVE_LEVEL_MIN, MOVE_LEVEL_MAX),
  );
  const savedFinisherLevels = (moves.finishers ?? []).map((move) =>
    clampInt(moveLevel(move), MOVE_LEVEL_MIN, MOVE_LEVEL_MAX),
  );
  const toMoves = (levels: number[]): LeveledMove[] => levels.map((level) => ({ level }));

  const cost = buildCost(
    { stats: savedStats },
    toMoves(savedSignatureLevels),
    toMoves(savedFinisherLevels),
  );
  const status = budgetStatus(cost, budget);

  let spentStats = savedStats;
  let signatureLevels = savedSignatureLevels;
  let finisherLevels = savedFinisherLevels;

  if (status.overBudget) {
    // Stat cost is convex in the points bought and move cost is linear, so
    // scaling everything by budget/cost already fits. The loop only guards
    // against rounding surprises.
    let factor = Math.max(0, budget) / cost;
    for (;;) {
      spentStats = {} as Record<CoreStat, number>;
      for (const stat of CORE_STATS) {
        spentStats[stat] = scaleAbove(savedStats[stat], STAT_BASE, factor);
      }
      signatureLevels = savedSignatureLevels.map((level) =>
        scaleAbove(level, MOVE_LEVEL_MIN, factor),
      );
      finisherLevels = savedFinisherLevels.map((level) =>
        scaleAbove(level, MOVE_LEVEL_MIN, factor),
      );
      const scaledCost = buildCost(
        { stats: spentStats },
        toMoves(signatureLevels),
        toMoves(finisherLevels),
      );
      if (scaledCost <= budget || factor === 0) break;
      factor = Math.max(0, factor - 0.01);
    }
  }

  const bonuses = STYLES[build.style]?.statBonuses ?? {};
  const stats = {} as Record<CoreStat, number>;
  for (const stat of CORE_STATS) {
    stats[stat] = Math.min(STAT_CAP, spentStats[stat] + (bonuses[stat] ?? 0));
  }

  const effective: EffectiveBuild = {
    style: build.style,
    stats,
    spentStats,
    signatureLevels,
    finisherLevels,
    scaled: status.overBudget,
    status,
  };
  if (build.specialty !== undefined) effective.specialty = build.specialty;
  return effective;
}

// ─── Defaults ───────────────────────────────────────────────────────

/**
 * The build every player starts with: all stats at base, allRounder, no
 * specialty. `updatedAt` is empty unless given, since a default is never saved.
 */
export function defaultBuild(updatedAt = ''): WrestlerBuild {
  const stats = {} as Record<CoreStat, number>;
  for (const stat of CORE_STATS) stats[stat] = STAT_BASE;
  return { style: 'allRounder', stats, updatedAt };
}
