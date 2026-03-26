export type TagTeamStatus =
  | 'pending_partner'
  | 'pending_admin'
  | 'active'
  | 'dissolved';

export interface TagTeam {
  tagTeamId: string;
  name: string;
  player1Id: string;
  player2Id: string;
  imageUrl?: string;
  status: TagTeamStatus;
  wins: number;
  losses: number;
  draws: number;
  createdAt: string;
  updatedAt: string;
  dissolvedAt?: string;
}

export interface TagTeamPlayerInfo {
  playerId: string;
  playerName: string;
  wrestlerName: string;
  imageUrl?: string;
  psnId?: string;
}

export interface TagTeamWithPlayers extends TagTeam {
  player1: TagTeamPlayerInfo;
  player2: TagTeamPlayerInfo;
}

export interface TagTeamStanding {
  tagTeamId: string;
  name: string;
  imageUrl?: string;
  player1Name: string;
  player2Name: string;
  wins: number;
  losses: number;
  draws: number;
  winPercentage: number;
  recentForm?: ('W' | 'L' | 'D')[];
  currentStreak?: { type: 'W' | 'L' | 'D'; count: number };
}

export interface TagTeamHeadToHead {
  opponentTagTeamId: string;
  opponentTagTeamName: string;
  wins: number;
  losses: number;
  draws: number;
}

export interface TagTeamMatchTypeRecord {
  matchFormat: string;
  wins: number;
  losses: number;
  draws: number;
}

export interface TagTeamDetailResponse extends TagTeamWithPlayers {
  standings: {
    winPercentage: number;
    recentForm: ('W' | 'L' | 'D')[];
    currentStreak: { type: 'W' | 'L' | 'D'; count: number };
  };
  headToHead: TagTeamHeadToHead[];
  matchTypeRecords: TagTeamMatchTypeRecord[];
  recentMatches: unknown[];
}

export interface CreateTagTeamInput {
  name: string;
  partnerId: string;
  imageUrl?: string;
}
