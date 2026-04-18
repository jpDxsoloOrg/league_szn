import type { TournamentsRepository } from '../TournamentsRepository';
import type { Tournament } from '../types';

export class InMemoryTournamentsRepository implements TournamentsRepository {
  readonly store = new Map<string, Tournament>();

  async findById(tournamentId: string): Promise<Tournament | null> {
    return this.store.get(tournamentId) ?? null;
  }

  async list(): Promise<Tournament[]> {
    return Array.from(this.store.values());
  }
}
