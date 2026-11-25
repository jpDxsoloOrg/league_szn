import { API_BASE_URL, fetchWithAuth } from './apiClient';

/**
 * Wrestler builds (BLD-03). Shapes mirror `backend/lib/builds/buildRulesView.ts`
 * and `backend/lib/builds/playerBuild.ts`. The frontend never hard-codes a
 * build number; everything comes from `GET /builds/rules`.
 */

export type BuildCoreStat = 'strikes' | 'grapple' | 'agility' | 'endurance';
export type BuildStyleId = 'powerhouse' | 'technician' | 'highFlyer' | 'brawler' | 'striker' | 'allRounder';
export type BuildSimCategory = 'standard' | 'highRisk' | 'technical' | 'endurance' | 'hardcore' | 'cage';

export interface BuildStatCostBand {
  /** First stat value in the band (inclusive). */
  from: number;
  /** Last stat value in the band (inclusive). */
  to: number;
  costPerPoint: number;
}

/** Budget numbers per division kind. `tiers` is keyed by tier number as a string. */
export interface BuildBudgetRules {
  tiers: Record<string, number>;
  defaultTier: number;
  developmental: number;
  noDivision: number;
}

export interface BuildStyleRule {
  id: BuildStyleId;
  statBonuses: Partial<Record<BuildCoreStat, number>>;
  beats: BuildStyleId | null;
  beatenBy: BuildStyleId | null;
  specialties: BuildSimCategory[];
  specialtyBonus: number;
}

export interface BuildRules {
  rulesVersion: number;
  stats: { coreStats: BuildCoreStat[]; base: number; cap: number; costBands: BuildStatCostBand[] };
  moves: { minLevel: number; maxLevel: number; signatureLevelCost: number; finisherLevelCost: number };
  budgets: BuildBudgetRules;
  styles: BuildStyleRule[];
  styleBeats: Partial<Record<BuildStyleId, BuildStyleId>>;
  styleEdge: number;
  simCategories: Array<{ id: BuildSimCategory; label: string; examples: string[] }>;
  specialtyCategories: BuildSimCategory[];
  styleSpecialties: Record<BuildStyleId, BuildSimCategory[]>;
  specialtyBonus: number;
  allRounderSpecialtyBonus: number;
}

export interface WrestlerBuild {
  style: BuildStyleId;
  specialty?: BuildSimCategory;
  stats: Record<BuildCoreStat, number>;
  updatedAt: string;
}

export interface BuildBudgetStatus {
  cost: number;
  budget: number;
  /** Negative when over budget. */
  remaining: number;
  overBudget: boolean;
}

export interface LeveledBuildMove {
  gameName: string;
  customName: string;
  level: number;
}

export interface EffectiveWrestlerBuild {
  style: BuildStyleId;
  specialty?: BuildSimCategory;
  stats: Record<BuildCoreStat, number>;
  spentStats: Record<BuildCoreStat, number>;
  signatureLevels: number[];
  finisherLevels: number[];
  scaled: boolean;
  status: BuildBudgetStatus;
}

export interface PlayerBuildView {
  playerId: string;
  build: WrestlerBuild;
  isDefault: boolean;
  moves: { signatures: LeveledBuildMove[]; finishers: LeveledBuildMove[] };
  /** Cost against the budget of the player's current division. */
  budget: BuildBudgetStatus;
  effective: EffectiveWrestlerBuild;
  rulesVersion: number;
}

export const buildsApi = {
  /** Public: every build rule, including the budget per tier. */
  getRules: async (signal?: AbortSignal): Promise<BuildRules> => {
    return fetchWithAuth(`${API_BASE_URL}/builds/rules`, {}, signal);
  },

  /** Public: a player's build with its cost and budget. 404 for hidden players. */
  getPlayerBuild: async (playerId: string, signal?: AbortSignal): Promise<PlayerBuildView> => {
    return fetchWithAuth(`${API_BASE_URL}/players/${encodeURIComponent(playerId)}/build`, {}, signal);
  },
};
