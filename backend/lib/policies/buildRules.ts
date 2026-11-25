/**
 * Wrestler build and match sim rules (BLD-01).
 *
 * Every tunable number for wrestler builds and the match sim lives here, so
 * balance changes never touch handlers. Bump RULES_VERSION whenever any value
 * in this file changes; recorded sims store it.
 *
 * Builds:
 *   - Four core stats start at STAT_BASE and cap at STAT_CAP. Each point above
 *     base costs build points by band (STAT_COST_BANDS).
 *   - Signature and finisher moves have levels 1..MOVE_LEVEL_MAX; each level
 *     above 1 costs SIGNATURE_LEVEL_COST or FINISHER_LEVEL_COST.
 *   - The budget comes from the wrestler's division tier (DMV-01), see
 *     `budgetForDivision`.
 *
 * Styles:
 *   - Each style adds a small flat bonus to some core stats.
 *   - STYLE_BEATS is a 5-cycle; the winner of a pairing gets STYLE_EDGE.
 *     allRounder sits outside the cycle (never beats, never beaten).
 *
 * Specialties:
 *   - A wrestler picks one sim category as a specialty; it must be one their
 *     style allows (STYLE_SPECIALTIES). `standard` is never a specialty.
 *   - Specialties are categories, not stipulation ids, because admins create
 *     stipulations freely. Each stipulation / match type carries a category
 *     (BLD-16).
 */
import type { Division } from '../repositories/types';
import { getDivisionTier } from '../divisionTiers';

/** Bump whenever any tunable in this file changes. */
export const RULES_VERSION = 1;

// ─── Core stats ─────────────────────────────────────────────────────

/** Endurance (not "Stamina"): it reduces the weekly stamina drain (INJ-02). */
export const CORE_STATS = ['strikes', 'grapple', 'agility', 'endurance'] as const;
export type CoreStat = (typeof CORE_STATS)[number];

export const STAT_BASE = 40;
export const STAT_CAP = 100;

export interface StatCostBand {
  /** First stat value in the band (inclusive). */
  from: number;
  /** Last stat value in the band (inclusive). */
  to: number;
  /** Build points per stat point inside the band. */
  costPerPoint: number;
}

/** Cost of raising a stat to each value. Bands are contiguous from STAT_BASE + 1 to STAT_CAP. */
export const STAT_COST_BANDS: readonly StatCostBand[] = [
  { from: 41, to: 75, costPerPoint: 1 },
  { from: 76, to: 90, costPerPoint: 2 },
  { from: 91, to: 100, costPerPoint: 3 },
];

// ─── Moves ──────────────────────────────────────────────────────────

export const MOVE_LEVEL_MIN = 1;
export const MOVE_LEVEL_MAX = 5;
/** Build points per signature level above 1. */
export const SIGNATURE_LEVEL_COST = 5;
/** Build points per finisher level above 1. */
export const FINISHER_LEVEL_COST = 8;

// ─── Budgets ────────────────────────────────────────────────────────

/** Budget by division tier (1 = top). Tiers not listed get DEFAULT_TIER_BUDGET. */
export const TIER_BUDGETS: Readonly<Record<number, number>> = { 1: 160, 2: 130 };
export const DEFAULT_TIER_BUDGET = 100;
/** Developmental divisions get this whatever their tier. */
export const DEVELOPMENTAL_BUDGET = 80;
export const NO_DIVISION_BUDGET = 80;

type BudgetDivision = Pick<Division, 'tier' | 'isDevelopmental'>;

/**
 * Build budget for a wrestler in `division`.
 * Developmental → DEVELOPMENTAL_BUDGET; none → NO_DIVISION_BUDGET; tiered →
 * TIER_BUDGETS[tier] or DEFAULT_TIER_BUDGET; untiered → DEFAULT_TIER_BUDGET.
 */
export function budgetForDivision(division: BudgetDivision | null | undefined): number {
  if (!division) return NO_DIVISION_BUDGET;
  if (division.isDevelopmental === true) return DEVELOPMENTAL_BUDGET;
  const tier = getDivisionTier(division);
  if (tier === undefined) return DEFAULT_TIER_BUDGET;
  return TIER_BUDGETS[tier] ?? DEFAULT_TIER_BUDGET;
}

// ─── Styles ─────────────────────────────────────────────────────────

export const STYLE_IDS = [
  'powerhouse',
  'technician',
  'highFlyer',
  'brawler',
  'striker',
  'allRounder',
] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export interface StyleDefinition {
  /** Flat bonus added to the effective stat (capped at STAT_CAP). */
  statBonuses: Readonly<Partial<Record<CoreStat, number>>>;
}

export const STYLES: Readonly<Record<StyleId, StyleDefinition>> = {
  powerhouse: { statBonuses: { grapple: 8 } },
  technician: { statBonuses: { grapple: 4, endurance: 4 } },
  highFlyer: { statBonuses: { agility: 8 } },
  brawler: { statBonuses: { strikes: 4, endurance: 4 } },
  striker: { statBonuses: { strikes: 8 } },
  allRounder: { statBonuses: { strikes: 2, grapple: 2, agility: 2, endurance: 2 } },
};

/**
 * Who each style beats: powerhouse → highFlyer → technician → brawler →
 * striker → powerhouse. allRounder is not in the cycle.
 */
export const STYLE_BEATS: Readonly<Partial<Record<StyleId, StyleId>>> = {
  powerhouse: 'highFlyer',
  highFlyer: 'technician',
  technician: 'brawler',
  brawler: 'striker',
  striker: 'powerhouse',
};

/** Rating multiplier step for a favourable style matchup. */
export const STYLE_EDGE = 0.05;

/** +1 when `style` beats `opponent`, −1 when it loses to it, else 0. */
export function styleMatchup(style: StyleId, opponent: StyleId): -1 | 0 | 1 {
  if (STYLE_BEATS[style] === opponent) return 1;
  if (STYLE_BEATS[opponent] === style) return -1;
  return 0;
}

export function isStyleId(value: unknown): value is StyleId {
  return typeof value === 'string' && (STYLE_IDS as readonly string[]).includes(value);
}

// ─── Sim categories and specialties ─────────────────────────────────

/**
 * Sim category of a match, set on each stipulation / match type (BLD-16).
 * highRisk: ladder, TLC, scaffold. technical: submission, I Quit, 2-out-of-3
 * falls. endurance: iron man, last man standing. hardcore: street fight,
 * extreme rules, tables, falls count anywhere. cage: steel cage, Hell in a Cell.
 */
export const SIM_CATEGORIES = [
  'standard',
  'highRisk',
  'technical',
  'endurance',
  'hardcore',
  'cage',
] as const;
export type SimCategory = (typeof SIM_CATEGORIES)[number];

/** Categories a wrestler can specialize in (everything except `standard`). */
export const SPECIALTY_CATEGORIES: readonly SimCategory[] = SIM_CATEGORIES.filter(
  (category) => category !== 'standard',
);

/** Which categories each style may pick as its specialty. */
export const STYLE_SPECIALTIES: Readonly<Record<StyleId, readonly SimCategory[]>> = {
  powerhouse: ['hardcore', 'cage'],
  highFlyer: ['highRisk', 'cage'],
  technician: ['technical', 'endurance'],
  brawler: ['hardcore', 'endurance'],
  striker: ['hardcore', 'endurance'],
  allRounder: SPECIALTY_CATEGORIES,
};

/** Rating bonus when the match's category is the competitor's specialty. */
export const SPECIALTY_BONUS = 0.06;
/** allRounder can pick anything, so its specialty bonus is smaller. */
export const ALL_ROUNDER_SPECIALTY_BONUS = 0.03;

export function isSimCategory(value: unknown): value is SimCategory {
  return typeof value === 'string' && (SIM_CATEGORIES as readonly string[]).includes(value);
}

/** Categories `style` may specialize in (empty for an unknown style). */
export function allowedSpecialties(style: StyleId): readonly SimCategory[] {
  return STYLE_SPECIALTIES[style] ?? [];
}

/** True when `style` may pick `category` as its specialty. `standard` is never allowed. */
export function isSpecialtyAllowed(style: StyleId, category: SimCategory): boolean {
  if (category === 'standard') return false;
  return allowedSpecialties(style).includes(category);
}

/** The specialty bonus a style earns when fighting in its specialty. */
export function specialtyBonusFor(style: StyleId): number {
  return style === 'allRounder' ? ALL_ROUNDER_SPECIALTY_BONUS : SPECIALTY_BONUS;
}
