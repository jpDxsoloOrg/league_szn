import type { Stable, StableStatus, StableInvitation } from './types';

export interface StableCreateInput {
  name: string;
  leaderId: string;
  memberIds: string[];
  imageUrl?: string;
  status?: StableStatus;
}

export interface StablePatch {
  name?: string;
  imageUrl?: string;
  status?: StableStatus;
  memberIds?: string[];
  wins?: number;
  losses?: number;
  draws?: number;
  disbandedAt?: string;
}

export interface StableInvitationCreateInput {
  stableId: string;
  invitedPlayerId: string;
  invitedByPlayerId: string;
  message?: string;
  expiresAt: string;
}

export interface StablesRepository {
  findById(stableId: string): Promise<Stable | null>;
  list(): Promise<Stable[]>;
  listByStatus(status: StableStatus): Promise<Stable[]>;
  findByPlayer(playerId: string): Promise<Stable | null>;
  create(input: StableCreateInput): Promise<Stable>;
  update(stableId: string, patch: StablePatch): Promise<Stable>;
  delete(stableId: string): Promise<void>;

  // Invitations
  findInvitationById(invitationId: string): Promise<StableInvitation | null>;
  listInvitationsByStable(stableId: string): Promise<StableInvitation[]>;
  listInvitationsByPlayer(playerId: string): Promise<StableInvitation[]>;
  listPendingInvitationsByPlayer(playerId: string): Promise<StableInvitation[]>;
  createInvitation(input: StableInvitationCreateInput): Promise<StableInvitation>;
  updateInvitation(invitationId: string, patch: Partial<StableInvitation>): Promise<StableInvitation>;
}
