import type { CrudRepository } from './CrudRepository';
import type {
  Player,
  TagTeam,
  TagTeamStatus,
  Stable,
  StableStatus,
  StableInvitation,
  WrestlerOverall,
  TransferRequest,
} from './types';

// ─── Player input types ─────────────────────────────────────────────

export interface PlayerCreateInput {
  name: string;
  currentWrestler: string;
  alternateWrestler?: string;
  imageUrl?: string;
  psnId?: string;
  divisionId?: string;
  companyId?: string;
  alignment?: 'face' | 'heel' | 'neutral';
}

export interface PlayerPatch {
  name?: string;
  currentWrestler?: string;
  alternateWrestler?: string;
  imageUrl?: string;
  psnId?: string;
  divisionId?: string;
  companyId?: string;
  stableId?: string | null;
  tagTeamId?: string | null;
  alignment?: 'face' | 'heel' | 'neutral';
  userId?: string;
}

// ─── Tag Team input types ───────────────────────────────────────────

export interface TagTeamCreateInput {
  name: string;
  player1Id: string;
  player2Id: string;
  imageUrl?: string;
  status?: TagTeamStatus;
}

export interface TagTeamPatch {
  name?: string;
  imageUrl?: string;
  status?: TagTeamStatus;
  wins?: number;
  losses?: number;
  draws?: number;
  dissolvedAt?: string;
}

// ─── Stable input types ─────────────────────────────────────────────

export interface StableCreateInput {
  name: string;
  leaderId: string;
  memberIds: string[];
  imageUrl?: string;
  status?: StableStatus;
}

export interface StablePatch {
  name?: string;
  leaderId?: string;
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

// ─── Overalls input types ───────────────────────────────────────────

export interface OverallSubmitInput {
  playerId: string;
  mainOverall: number;
  alternateOverall?: number;
}

export interface JoinedOverall extends WrestlerOverall {
  playerName: string;
  wrestlerName: string;
}

// ─── Transfer input types ───────────────────────────────────────────

export interface TransferCreateInput {
  playerId: string;
  fromDivisionId: string;
  toDivisionId: string;
  reason: string;
}

export interface TransferReviewInput {
  status: 'approved' | 'rejected';
  reviewedBy: string;
  reviewNote?: string;
}

// ─── Sub-interfaces ─────────────────────────────────────────────────

export interface StablesMethods {
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
  deleteInvitation(invitationId: string): Promise<void>;
  deleteInvitationsByStable(stableId: string): Promise<void>;
}

export interface OverallsMethods {
  findByPlayerId(playerId: string): Promise<WrestlerOverall | null>;
  listAll(): Promise<WrestlerOverall[]>;
  submit(input: OverallSubmitInput): Promise<WrestlerOverall>;
}

export interface TransfersMethods {
  findById(requestId: string): Promise<TransferRequest | null>;
  list(): Promise<TransferRequest[]>;
  listByStatus(status: string): Promise<TransferRequest[]>;
  listByPlayer(playerId: string): Promise<TransferRequest[]>;
  listPendingByPlayer(playerId: string): Promise<TransferRequest[]>;
  create(input: TransferCreateInput): Promise<TransferRequest>;
  review(requestId: string, input: TransferReviewInput): Promise<TransferRequest>;
}

// ─── Aggregate interface ────────────────────────────────────────────

export interface RosterRepository {
  players: CrudRepository<Player, PlayerCreateInput, PlayerPatch> & {
    findByUserId(userId: string): Promise<Player | null>;
  };
  tagTeams: CrudRepository<TagTeam, TagTeamCreateInput, TagTeamPatch> & {
    listByStatus(status: TagTeamStatus): Promise<TagTeam[]>;
    listByPlayer(playerId: string): Promise<TagTeam[]>;
  };
  stables: StablesMethods;
  overalls: OverallsMethods;
  transfers: TransfersMethods;
}
