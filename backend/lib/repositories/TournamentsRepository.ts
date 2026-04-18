import type { Tournament } from './types';

export interface TournamentsRepository {
  findById(tournamentId: string): Promise<Tournament | null>;
  list(): Promise<Tournament[]>;
  update(tournamentId: string, patch: Partial<Tournament>): Promise<Tournament>;
}
