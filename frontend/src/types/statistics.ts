export interface PlayerStatistics {
  playerId: string;
  statType: 'overall' | 'singles' | 'tag' | 'ladder' | 'cage';
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  winPercentage: number;
  currentWinStreak: number;
  longestWinStreak: number;
  longestLossStreak: number;
  firstMatchDate?: string;
  lastMatchDate?: string;
  championshipWins: number;
  championshipLosses: number;
  updatedAt: string;
}

export interface HeadToHead {
  matchupKey: string;
  player1Id: string;
  player2Id: string;
  player1Wins: number;
  player2Wins: number;
  draws: number;
  totalMatches: number;
  lastMatchDate?: string;
  lastMatchId?: string;
  championshipMatches: number;
  recentResults: {
    matchId: string;
    winnerId: string;
    date: string;
  }[];
  updatedAt: string;
}

export interface ChampionshipStats {
  playerId: string;
  championshipId: string;
  totalReigns: number;
  totalDaysHeld: number;
  longestReign: number;
  shortestReign: number;
  totalDefenses: number;
  mostDefensesInReign: number;
  firstWonDate?: string;
  lastWonDate?: string;
  currentlyHolding: boolean;
  updatedAt: string;
}

export interface Achievement {
  playerId: string;
  achievementId: string;
  achievementName: string;
  achievementType: 'milestone' | 'record' | 'special';
  description: string;
  earnedAt: string;
  metadata?: Record<string, unknown>;
  icon: string;
}

export interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  wrestlerName: string;
  value: number;
  rank: number;
}

export interface RecordEntry {
  recordName: string;
  holderName: string;
  wrestlerName: string;
  value: number | string;
  date: string;
  description: string;
}
