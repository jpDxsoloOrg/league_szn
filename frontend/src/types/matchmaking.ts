export interface MatchmakingPreferences {
  matchFormat?: string;
  stipulationId?: string;
}

export interface PresenceEntry {
  playerId: string;
  lastSeenAt: string;
}

export interface QueueEntry {
  playerId: string;
  name: string;
  currentWrestler: string;
  imageUrl?: string;
  preferences: MatchmakingPreferences;
  joinedAt: string;
}

export type JoinQueueResponse =
  | { status: 'queued' }
  | { status: 'matched'; matchId: string; opponent: { playerId: string; name: string } };

export interface OnlinePlayer {
  playerId: string;
  name: string;
  currentWrestler: string;
  imageUrl?: string;
  lastSeenAt: string;
  inQueue: boolean;
}

export type MatchInvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export interface MatchInvitationPlayerSummary {
  playerId: string;
  name: string;
  currentWrestler: string;
  imageUrl?: string;
}

export interface MatchInvitation {
  invitationId: string;
  fromPlayerId: string;
  toPlayerId: string;
  matchFormat?: string;
  stipulationId?: string;
  status: MatchInvitationStatus;
  createdAt: string;
  expiresAt: string;
  from: MatchInvitationPlayerSummary;
  to: MatchInvitationPlayerSummary;
}

export interface InvitationListResponse {
  incoming: MatchInvitation[];
  outgoing: MatchInvitation[];
}

export interface AcceptInvitationResponse {
  matchId: string;
  invitation: MatchInvitation;
}
