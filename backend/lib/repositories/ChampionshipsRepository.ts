import type { Championship, ChampionshipHistoryEntry } from './types';

export interface ChampionshipsRepository {
  findById(championshipId: string): Promise<Championship | null>;
  list(): Promise<Championship[]>;
  listActive(): Promise<Championship[]>;

  // Championship history
  listHistory(championshipId: string): Promise<ChampionshipHistoryEntry[]>;
  listAllHistory(): Promise<ChampionshipHistoryEntry[]>;
  findCurrentReign(championshipId: string): Promise<ChampionshipHistoryEntry | null>;
}
