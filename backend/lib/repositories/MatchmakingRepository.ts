export interface PresenceRecord {
  playerId: string;
  lastSeenAt: string;
  ttl: number;
}

export interface QueueRecord {
  playerId: string;
  joinedAt: string;
  preferences?: { matchFormat?: string; stipulationId?: string };
  ttl: number;
}

export interface InvitationRecord {
  invitationId: string;
  fromPlayerId: string;
  toPlayerId: string;
  matchFormat?: string;
  stipulationId?: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  updatedAt?: string;
  acceptedAt?: string;
  ttl: number;
  [key: string]: unknown;
}

export interface MatchmakingRepository {
  // Presence
  putPresence(record: PresenceRecord): Promise<void>;
  getPresence(playerId: string): Promise<PresenceRecord | null>;
  listPresence(): Promise<PresenceRecord[]>;
  deletePresence(playerId: string): Promise<void>;

  // Queue
  putQueue(record: QueueRecord): Promise<void>;
  listQueue(): Promise<QueueRecord[]>;
  deleteQueue(playerId: string): Promise<void>;

  // Invitations
  putInvitation(record: InvitationRecord): Promise<void>;
  getInvitation(invitationId: string): Promise<InvitationRecord | null>;
  listInvitationsByToPlayer(toPlayerId: string): Promise<InvitationRecord[]>;
  listInvitationsByFromPlayer(fromPlayerId: string): Promise<InvitationRecord[]>;
  updateInvitation(invitationId: string, patch: Record<string, unknown>, conditionStatus?: string): Promise<InvitationRecord>;
}
