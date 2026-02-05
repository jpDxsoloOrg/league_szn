// Fantasy User
export interface FantasyUser {
  fantasyUserId: string;
  username: string;
  email: string;
  totalPoints: number;
  currentSeasonPoints: number;
  perfectPicks: number;
  currentStreak: number;
  bestStreak: number;
  createdAt: string;
  updatedAt: string;
}

// Show (Fantasy Event)
export interface Show {
  showId: string;
  seasonId: string;
  name: string;
  date: string;
  status: 'draft' | 'open' | 'locked' | 'completed';
  picksPerDivision: number;
  budget: number;
  matchIds: string[];
  createdAt: string;
  updatedAt: string;
}

// Fantasy Picks
export interface FantasyPicks {
  showId: string;
  fantasyUserId: string;
  picks: Record<string, string[]>; // divisionId -> playerIds
  totalSpent: number;
  pointsEarned?: number;
  breakdown?: Record<string, PointBreakdown>;
  createdAt: string;
  updatedAt: string;
}

export interface PointBreakdown {
  points: number;
  basePoints: number;
  multipliers: string[];
  matchId?: string;
  reason: string;
}

// Wrestler Cost
export interface WrestlerCost {
  playerId: string;
  currentCost: number;
  baseCost: number;
  costHistory: CostChange[];
  winRate30Days: number;
  updatedAt: string;
}

export interface CostChange {
  date: string;
  cost: number;
  reason: string;
}

// Fantasy Configuration
export interface FantasyConfig {
  configKey: string;
  defaultBudget: number;
  defaultPicksPerDivision: number;
  baseWinPoints: number;
  championshipBonus: number;
  titleWinBonus: number;
  costFluctuationEnabled: boolean;
  costChangePerWin: number;
  costChangePerLoss: number;
  costResetStrategy: 'reset' | 'carry_over' | 'partial';
  underdogMultiplier: number;
  perfectPickBonus: number;
  streakBonusThreshold: number;
  streakBonusPoints: number;
}

// Fantasy Leaderboard Entry
export interface FantasyLeaderboardEntry {
  rank: number;
  fantasyUserId: string;
  username: string;
  totalPoints: number;
  currentSeasonPoints: number;
  perfectPicks: number;
  currentStreak: number;
}

// Extended types for UI display
export interface WrestlerWithCost {
  playerId: string;
  name: string;
  currentWrestler: string;
  divisionId?: string;
  imageUrl?: string;
  currentCost: number;
  baseCost: number;
  costTrend: 'up' | 'down' | 'stable';
  winRate30Days: number;
  recentRecord: string; // e.g., "5-1"
}

export interface ShowWithDetails extends Show {
  matchCount: number;
  picksCount: number;
  isUserPicked: boolean;
}

export interface PickSummary {
  divisionId: string;
  divisionName: string;
  selectedCount: number;
  maxPicks: number;
  wrestlers: WrestlerWithCost[];
}

// Form types for creating/editing
export interface CreateShowInput {
  seasonId: string;
  name: string;
  date: string;
  picksPerDivision: number;
  budget: number;
}

export interface UpdateShowInput {
  name?: string;
  date?: string;
  picksPerDivision?: number;
  budget?: number;
  matchIds?: string[];
}

export interface SubmitPicksInput {
  picks: Record<string, string[]>; // divisionId -> playerIds
}

export interface UpdateConfigInput {
  defaultBudget?: number;
  defaultPicksPerDivision?: number;
  baseWinPoints?: number;
  championshipBonus?: number;
  titleWinBonus?: number;
  costFluctuationEnabled?: boolean;
  costChangePerWin?: number;
  costChangePerLoss?: number;
  costResetStrategy?: 'reset' | 'carry_over' | 'partial';
  underdogMultiplier?: number;
  perfectPickBonus?: number;
  streakBonusThreshold?: number;
  streakBonusPoints?: number;
}

// Auth types for fantasy users
export interface FantasySignupInput {
  email: string;
  password: string;
  username: string;
}

export interface FantasyLoginInput {
  email: string;
  password: string;
}

export interface FantasyAuthResponse {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  fantasyUser: FantasyUser;
}
