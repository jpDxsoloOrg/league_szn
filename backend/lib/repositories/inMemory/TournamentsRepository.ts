import type { TournamentsRepository } from '../TournamentsRepository';
import { NotFoundError } from '../errors';
import type { Tournament } from '../types';

export class InMemoryTournamentsRepository implements TournamentsRepository {
  readonly store = new Map<string, Tournament>();

  async findById(tournamentId: string): Promise<Tournament | null> {
    return this.store.get(tournamentId) ?? null;
  }

  async list(): Promise<Tournament[]> {
    return Array.from(this.store.values());
  }

  async create(input: Record<string, unknown>): Promise<Tournament> {
    const tournament = input as unknown as Tournament;
    this.store.set(tournament.tournamentId, tournament);
    return tournament;
  }

  async update(tournamentId: string, patch: Partial<Tournament>): Promise<Tournament> {
    const existing = this.store.get(tournamentId);
    if (!existing) throw new NotFoundError('Tournament', tournamentId);
    const updated: Tournament = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.store.set(tournamentId, updated);
    return updated;
  }
}
