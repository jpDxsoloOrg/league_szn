export type StableStatus = 'pending' | 'approved' | 'active' | 'disbanded';

export interface Stable {
  stableId: string;
  name: string;
  leaderId: string;
  memberIds: string[]; // playerIds including leader, 2-6 items
  imageUrl?: string;
  status: StableStatus;
  wins: number;
  losses: number;
  draws: number;
  createdAt: string;
  updatedAt: string;
  disbandedAt?: string;
}

export interface StablePlayerInfo {
  playerId: string;
  playerName: string;
  wrestlerName: string;
  imageUrl?: string;
  psnId?: string;
  wins: number;
  losses: number;
  draws: number;
}

export interface StableWithMembers extends Stable {
  members: StablePlayerInfo[];
  leaderName?: string;
}

export type StableInvitationStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'expired';

export interface StableInvitation {
  invitationId: string;
  stableId: string;
  invitedPlayerId: string;
  invitedByPlayerId: string;
  status: StableInvitationStatus;
  message?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface StableInvitationWithDetails extends StableInvitation {
  stableName: string;
  invitedPlayerName?: string;
  invitedByPlayerName?: string;
}

export interface StableStanding {
  stableId: string;
  name: string;
  imageUrl?: string;
  memberCount: number;
  wins: number;
  losses: number;
  draws: number;
  winPercentage: number;
  recentForm?: ('W' | 'L' | 'D')[];
  currentStreak?: { type: 'W' | 'L' | 'D'; count: number };
}

export interface StableHeadToHead {
  opponentStableId: string;
  opponentStableName: string;
  wins: number;
  losses: number;
  draws: number;
}

export interface StableMatchTypeRecord {
  matchFormat: string;
  wins: number;
  losses: number;
  draws: number;
}

export interface StableDetailResponse extends StableWithMembers {
  standings: {
    winPercentage: number;
    recentForm: ('W' | 'L' | 'D')[];
    currentStreak: { type: 'W' | 'L' | 'D'; count: number };
  };
  headToHead: StableHeadToHead[];
  matchTypeRecords: StableMatchTypeRecord[];
  recentMatches: unknown[]; // Match objects
}

export interface CreateStableInput {
  name: string;
  imageUrl?: string;
}

export interface InviteToStableInput {
  playerId: string;
  message?: string;
}
