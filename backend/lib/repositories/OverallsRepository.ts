import type { WrestlerOverall } from './types';

export interface OverallSubmitInput {
  playerId: string;
  mainOverall: number;
  alternateOverall?: number;
}

export interface JoinedOverall extends WrestlerOverall {
  playerName: string;
  wrestlerName: string;
}

export interface OverallsRepository {
  findByPlayerId(playerId: string): Promise<WrestlerOverall | null>;
  listAll(): Promise<WrestlerOverall[]>;
  submit(input: OverallSubmitInput): Promise<WrestlerOverall>;
}
