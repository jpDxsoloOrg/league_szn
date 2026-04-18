import type { FantasyConfig, FantasyPick, WrestlerCost } from './types';

export interface FantasyPickInput {
  eventId: string;
  fantasyUserId: string;
  username?: string;
  picks: Record<string, string[]>;
  totalSpent?: number;
}

export interface WrestlerCostInitInput {
  playerId: string;
  baseCost: number;
}

export interface FantasyRepository {
  // Config
  getConfig(): Promise<FantasyConfig | null>;
  upsertConfig(config: Partial<FantasyConfig>): Promise<FantasyConfig>;

  // Picks
  findPick(eventId: string, fantasyUserId: string): Promise<FantasyPick | null>;
  listPicksByEvent(eventId: string): Promise<FantasyPick[]>;
  listPicksByUser(fantasyUserId: string): Promise<FantasyPick[]>;
  listAllPicks(): Promise<FantasyPick[]>;
  savePick(input: FantasyPickInput, existingCreatedAt?: string): Promise<FantasyPick>;
  updatePickScoring(
    eventId: string,
    fantasyUserId: string,
    pointsEarned: number,
    breakdown: Record<string, unknown>,
  ): Promise<void>;
  deletePick(eventId: string, fantasyUserId: string): Promise<void>;

  // Wrestler costs
  findCost(playerId: string): Promise<WrestlerCost | null>;
  listAllCosts(): Promise<WrestlerCost[]>;
  upsertCost(cost: WrestlerCost): Promise<WrestlerCost>;
  initializeCost(input: WrestlerCostInitInput): Promise<WrestlerCost>;
}
