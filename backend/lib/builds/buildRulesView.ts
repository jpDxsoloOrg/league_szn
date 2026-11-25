/**
 * Every build rule the frontend needs, in one payload (BLD-03), so the build
 * editor, the public build card and Manage Divisions never hard-code a number.
 * All values come from `lib/policies/buildRules.ts`.
 */
import {
  ALL_ROUNDER_SPECIALTY_BONUS,
  CORE_STATS,
  DEFAULT_TIER_BUDGET,
  DEVELOPMENTAL_BUDGET,
  FINISHER_LEVEL_COST,
  MOVE_LEVEL_MAX,
  MOVE_LEVEL_MIN,
  NO_DIVISION_BUDGET,
  RULES_VERSION,
  SIGNATURE_LEVEL_COST,
  SIM_CATEGORIES,
  SPECIALTY_BONUS,
  SPECIALTY_CATEGORIES,
  STAT_BASE,
  STAT_CAP,
  STAT_COST_BANDS,
  STYLES,
  STYLE_BEATS,
  STYLE_EDGE,
  STYLE_IDS,
  STYLE_SPECIALTIES,
  TIER_BUDGETS,
  allowedSpecialties,
  specialtyBonusFor,
  type CoreStat,
  type SimCategory,
  type StatCostBand,
  type StyleId,
} from '../policies/buildRules';

/**
 * English label and example stipulations per sim category. The frontend
 * translates by category id; these are the fallback and the API docs' wording.
 */
export const SIM_CATEGORY_LABELS: Readonly<Record<SimCategory, { label: string; examples: readonly string[] }>> = {
  standard: { label: 'Standard', examples: ['Singles', 'Tag team', 'Triple threat'] },
  highRisk: { label: 'High risk', examples: ['Ladder', 'TLC', 'Scaffold'] },
  technical: { label: 'Technical', examples: ['Submission', 'I Quit', '2 out of 3 falls'] },
  endurance: { label: 'Endurance', examples: ['Iron Man', 'Last Man Standing'] },
  hardcore: { label: 'Hardcore', examples: ['Street Fight', 'Extreme Rules', 'Tables', 'Falls Count Anywhere'] },
  cage: { label: 'Cage', examples: ['Steel Cage', 'Hell in a Cell'] },
};

export interface StyleRuleView {
  id: StyleId;
  statBonuses: Partial<Record<CoreStat, number>>;
  /** The style this one beats, or null (allRounder). */
  beats: StyleId | null;
  /** The style that beats this one, or null (allRounder). */
  beatenBy: StyleId | null;
  specialties: SimCategory[];
  specialtyBonus: number;
}

export interface BuildRulesView {
  rulesVersion: number;
  stats: { coreStats: CoreStat[]; base: number; cap: number; costBands: StatCostBand[] };
  moves: { minLevel: number; maxLevel: number; signatureLevelCost: number; finisherLevelCost: number };
  budgets: {
    /** Budget by division tier, keyed by tier number as a string. */
    tiers: Record<string, number>;
    defaultTier: number;
    developmental: number;
    noDivision: number;
  };
  styles: StyleRuleView[];
  styleBeats: Partial<Record<StyleId, StyleId>>;
  styleEdge: number;
  simCategories: Array<{ id: SimCategory; label: string; examples: string[] }>;
  specialtyCategories: SimCategory[];
  styleSpecialties: Record<StyleId, SimCategory[]>;
  specialtyBonus: number;
  allRounderSpecialtyBonus: number;
}

function beatenBy(style: StyleId): StyleId | null {
  const winner = STYLE_IDS.find((candidate) => STYLE_BEATS[candidate] === style);
  return winner ?? null;
}

export function getBuildRulesView(): BuildRulesView {
  const styleSpecialties = {} as Record<StyleId, SimCategory[]>;
  for (const style of STYLE_IDS) styleSpecialties[style] = [...STYLE_SPECIALTIES[style]];

  return {
    rulesVersion: RULES_VERSION,
    stats: {
      coreStats: [...CORE_STATS],
      base: STAT_BASE,
      cap: STAT_CAP,
      costBands: STAT_COST_BANDS.map((band) => ({ ...band })),
    },
    moves: {
      minLevel: MOVE_LEVEL_MIN,
      maxLevel: MOVE_LEVEL_MAX,
      signatureLevelCost: SIGNATURE_LEVEL_COST,
      finisherLevelCost: FINISHER_LEVEL_COST,
    },
    budgets: {
      tiers: Object.fromEntries(Object.entries(TIER_BUDGETS)),
      defaultTier: DEFAULT_TIER_BUDGET,
      developmental: DEVELOPMENTAL_BUDGET,
      noDivision: NO_DIVISION_BUDGET,
    },
    styles: STYLE_IDS.map((id) => ({
      id,
      statBonuses: { ...STYLES[id].statBonuses },
      beats: STYLE_BEATS[id] ?? null,
      beatenBy: beatenBy(id),
      specialties: [...allowedSpecialties(id)],
      specialtyBonus: specialtyBonusFor(id),
    })),
    styleBeats: { ...STYLE_BEATS },
    styleEdge: STYLE_EDGE,
    simCategories: SIM_CATEGORIES.map((id) => ({
      id,
      label: SIM_CATEGORY_LABELS[id].label,
      examples: [...SIM_CATEGORY_LABELS[id].examples],
    })),
    specialtyCategories: [...SPECIALTY_CATEGORIES],
    styleSpecialties,
    specialtyBonus: SPECIALTY_BONUS,
    allRounderSpecialtyBonus: ALL_ROUNDER_SPECIALTY_BONUS,
  };
}
