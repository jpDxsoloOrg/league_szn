import type { ColumnType, Generated } from 'kysely';
import type { WrestlerPromotion } from '../types';

type IsoTimestamp = ColumnType<string, string | Date | undefined, string | Date>;
type Alignment = 'face' | 'heel' | 'neutral';
type TagTeamStatusRow = 'pending_partner' | 'pending_admin' | 'active' | 'dissolved';
type StableStatusRow = 'pending' | 'approved' | 'active' | 'disbanded';
type StableInvitationStatusRow = 'pending' | 'accepted' | 'declined' | 'expired';
type TransferStatusRow = 'pending' | 'approved' | 'rejected';
type WrestlerSlot = 'primary' | 'alternate';

export interface PlayersTable {
  player_id: string;
  user_id: string | null;
  name: string;
  current_wrestler: string;
  alternate_wrestler: string | null;
  current_wrestler_id: string | null;
  alternate_wrestler_id: string | null;
  wins: Generated<number>;
  losses: Generated<number>;
  draws: Generated<number>;
  image_url: string | null;
  psn_id: string | null;
  division_id: string | null;
  company_id: string | null;
  stable_id: string | null;
  tag_team_id: string | null;
  alignment: Alignment | null;
  main_overall: number | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface TagTeamsTable {
  tag_team_id: string;
  name: string;
  player1_id: string;
  player2_id: string;
  image_url: string | null;
  status: Generated<TagTeamStatusRow>;
  wins: Generated<number>;
  losses: Generated<number>;
  draws: Generated<number>;
  dissolved_at: string | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface StablesTable {
  stable_id: string;
  name: string;
  leader_id: string;
  image_url: string | null;
  status: Generated<StableStatusRow>;
  wins: Generated<number>;
  losses: Generated<number>;
  draws: Generated<number>;
  disbanded_at: string | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface StableMembersTable {
  stable_id: string;
  player_id: string;
  joined_at: IsoTimestamp;
}

export interface StableInvitationsTable {
  invitation_id: string;
  stable_id: string;
  invited_player_id: string;
  invited_by_player_id: string;
  status: Generated<StableInvitationStatusRow>;
  message: string | null;
  expires_at: IsoTimestamp;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface WrestlersTable {
  wrestler_id: string;
  promotion: WrestlerPromotion;
  name: string;
  overall_cap: number;
  is_in_use: Generated<boolean>;
  assigned_player_id: string | null;
  assigned_slot: WrestlerSlot | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface WrestlerOverallsTable {
  player_id: string;
  main_overall: number;
  alternate_overall: number | null;
  submitted_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface TransferRequestsTable {
  request_id: string;
  player_id: string;
  from_division_id: string | null;
  to_division_id: string | null;
  reason: string;
  status: Generated<TransferStatusRow>;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface DivisionsTable {
  division_id: string;
  name: string;
  description: string | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface CompaniesTable {
  company_id: string;
  name: string;
  abbreviation: string | null;
  image_url: string | null;
  description: string | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface DB {
  players: PlayersTable;
  tag_teams: TagTeamsTable;
  stables: StablesTable;
  stable_members: StableMembersTable;
  stable_invitations: StableInvitationsTable;
  wrestlers: WrestlersTable;
  wrestler_overalls: WrestlerOverallsTable;
  transfer_requests: TransferRequestsTable;
  divisions: DivisionsTable;
  companies: CompaniesTable;
}
