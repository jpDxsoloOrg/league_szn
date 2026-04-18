import type { Championship, ChampionshipHistoryEntry } from './types';

export interface ChampionshipPatch {
  name?: string;
  type?: 'singles' | 'tag';
  currentChampion?: string | string[] | null;
  imageUrl?: string;
  isActive?: boolean;
  defenses?: number;
}

export interface ChampionshipCreateInput {
  name: string;
  type: 'singles' | 'tag';
  currentChampion?: string | string[];
  divisionId?: string;
  imageUrl?: string;
  [key: string]: unknown;
}

export interface ChampionshipsRepository {
  findById(championshipId: string): Promise<Championship | null>;
  list(): Promise<Championship[]>;
  listActive(): Promise<Championship[]>;
  create(input: ChampionshipCreateInput): Promise<Championship>;
  update(championshipId: string, patch: ChampionshipPatch): Promise<Championship>;
  delete(championshipId: string): Promise<void>;
  removeChampion(championshipId: string): Promise<Championship>;

  // Championship history
  listHistory(championshipId: string): Promise<ChampionshipHistoryEntry[]>;
  listAllHistory(): Promise<ChampionshipHistoryEntry[]>;
  findCurrentReign(championshipId: string): Promise<ChampionshipHistoryEntry | null>;
  closeReign(championshipId: string, wonDate: string, lostDate: string, daysHeld: number): Promise<void>;
  reopenReign(championshipId: string, wonDate: string): Promise<void>;
  deleteHistoryEntry(championshipId: string, wonDate: string): Promise<void>;
  incrementDefenses(championshipId: string, wonDate: string): Promise<void>;
  decrementDefenses(championshipId: string, wonDate: string): Promise<void>;
}
