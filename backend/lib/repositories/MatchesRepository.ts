import type { Match } from './types';

export interface MatchesRepository {
  findById(matchId: string): Promise<Match | null>;
  /** Find a match by matchId, also returning its sort key (date). */
  findByIdWithDate(matchId: string): Promise<(Match & { date: string }) | null>;
  list(): Promise<Match[]>;
  listCompleted(): Promise<Match[]>;
  listByStatus(status: string): Promise<Match[]>;
  listByTournament(tournamentId: string): Promise<Match[]>;
  listBySeason(seasonId: string): Promise<Match[]>;
  create(input: Record<string, unknown>): Promise<Match>;
  update(matchId: string, date: string, patch: Record<string, unknown>): Promise<Match>;
  delete(matchId: string, date: string): Promise<void>;
}
