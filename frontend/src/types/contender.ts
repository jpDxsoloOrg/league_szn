export interface ContenderRanking {
  championshipId: string;
  playerId: string;
  rank: number;
  rankingScore: number;
  winPercentage: number;
  currentStreak: number;
  qualityScore: number;
  recencyScore: number;
  matchesInPeriod: number;
  winsInPeriod: number;
  previousRank?: number;
  peakRank: number;
  weeksAtTop: number;
  calculatedAt: string;
  updatedAt: string;
}

export interface RankingMovement {
  playerId: string;
  currentRank: number;
  previousRank?: number;
  movement: number;
  isNew: boolean;
}

export interface ContenderConfig {
  championshipId: string;
  rankingPeriodDays: number;
  minimumMatches: number;
  maxContenders: number;
  includeDraws: boolean;
  divisionRestricted: boolean;
}

// Display types for UI
export interface ContenderWithPlayer extends ContenderRanking {
  playerName: string;
  wrestlerName: string;
  imageUrl?: string;
  movement: number;
  isNew: boolean;
}

export interface ChampionshipContenders {
  championshipId: string;
  championshipName: string;
  divisionId?: string | null;
  currentChampion: {
    playerId: string;
    playerName: string;
    wrestlerName: string;
    imageUrl?: string;
  };
  contenders: ContenderWithPlayer[];
  calculatedAt: string;
  config?: ContenderConfig;
}

export interface PlayerContenderStatus {
  playerId: string;
  playerName: string;
  championships: Array<{
    championshipId: string;
    championshipName: string;
    rank: number;
    rankingScore: number;
    isEligible: boolean;
    matchesNeeded: number;
    pathToTitle: string;
  }>;
}
