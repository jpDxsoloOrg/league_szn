import type { Tournament } from './types';

export interface TournamentsRepository {
  findById(tournamentId: string): Promise<Tournament | null>;
  list(): Promise<Tournament[]>;
  create(input: Record<string, unknown>): Promise<Tournament>;
  update(tournamentId: string, patch: Partial<Tournament>): Promise<Tournament>;
}
