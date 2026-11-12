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
  player1WrestlerName?: string;
  player2WrestlerName?: string;
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
  /** Null when the player record no longer exists. */
  player1: TagTeamPlayerInfo | null;
  player2: TagTeamPlayerInfo | null;
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

export interface TagTeamRecentMatch {
  matchId: string;
  date: string;
  matchFormat?: string;
  result: 'W' | 'L' | 'D';
  opponentPlayerIds: string[];
}

export interface TagTeamDetailResponse extends TagTeamWithPlayers {
  standings: {
    winPercentage: number;
    recentForm: ('W' | 'L' | 'D')[];
    currentStreak: { type: 'W' | 'L' | 'D'; count: number };
  };
  headToHead: TagTeamHeadToHead[];
  matchTypeRecords: TagTeamMatchTypeRecord[];
  recentMatches: TagTeamRecentMatch[];
}

export interface CreateTagTeamInput {
  name: string;
  partnerId: string;
  imageUrl?: string;
}

/** Body for POST /tag-teams/admin, where a GM forms an active team directly. */
export interface AdminCreateTagTeamInput {
  name: string;
  player1Id: string;
  player2Id: string;
  imageUrl?: string;
  /** Defaults to true on the server. */
  notifyPlayers?: boolean;
}

export interface AdminCreateTagTeamResult extends TagTeam {
  /** Pending requests for either player that the new team closed. */
  supersededTagTeamIds: string[];
}
