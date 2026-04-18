import type { MatchesRepository } from '../MatchesRepository';
import type { Match } from '../types';

export class InMemoryMatchesRepository implements MatchesRepository {
  readonly store = new Map<string, Match>();

  async findById(matchId: string): Promise<Match | null> {
    return this.store.get(matchId) ?? null;
  }

  async list(): Promise<Match[]> {
    return Array.from(this.store.values());
  }

  async listCompleted(): Promise<Match[]> {
    return Array.from(this.store.values()).filter((m) => m.status === 'completed');
  }

  async listByStatus(status: string): Promise<Match[]> {
    return Array.from(this.store.values()).filter((m) => m.status === status);
  }

  async listByTournament(tournamentId: string): Promise<Match[]> {
    return Array.from(this.store.values()).filter((m) => m.tournamentId === tournamentId);
  }

  async listBySeason(seasonId: string): Promise<Match[]> {
    return Array.from(this.store.values()).filter((m) => m.seasonId === seasonId);
  }

  async findByIdWithDate(matchId: string): Promise<(Match & { date: string }) | null> {
    const match = this.store.get(matchId);
    if (!match) return null;
    return { ...match, date: match.date };
  }

  async create(input: Record<string, unknown>): Promise<Match> {
    const match = input as unknown as Match;
    this.store.set(match.matchId, match);
    return match;
  }

  async update(matchId: string, _date: string, patch: Record<string, unknown>): Promise<Match> {
    const existing = this.store.get(matchId);
    if (!existing) throw new Error(`Match ${matchId} not found`);
    const updated: Match = { ...existing, ...patch, updatedAt: new Date().toISOString() } as Match;
    this.store.set(matchId, updated);
    return updated;
  }

  async delete(matchId: string, _date: string): Promise<void> {
    this.store.delete(matchId);
  }
}
