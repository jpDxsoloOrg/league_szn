import type { TagTeam, TagTeamStatus } from './types';

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

export interface TagTeamsRepository {
  findById(tagTeamId: string): Promise<TagTeam | null>;
  list(): Promise<TagTeam[]>;
  listByStatus(status: TagTeamStatus): Promise<TagTeam[]>;
  listByPlayer(playerId: string): Promise<TagTeam[]>;
  create(input: TagTeamCreateInput): Promise<TagTeam>;
  update(tagTeamId: string, patch: TagTeamPatch): Promise<TagTeam>;
  delete(tagTeamId: string): Promise<void>;
}
