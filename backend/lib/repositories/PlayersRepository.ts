import type { Player } from './types';

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

export interface PlayersRepository {
  findById(playerId: string): Promise<Player | null>;
  findByUserId(userId: string): Promise<Player | null>;
  list(): Promise<Player[]>;
  create(input: PlayerCreateInput): Promise<Player>;
  update(playerId: string, patch: PlayerPatch): Promise<Player>;
  delete(playerId: string): Promise<void>;
}
