import type { Match } from './types';

export interface MatchesRepository {
  findById(matchId: string): Promise<Match | null>;
  list(): Promise<Match[]>;
  listCompleted(): Promise<Match[]>;
  listByStatus(status: string): Promise<Match[]>;
  listByTournament(tournamentId: string): Promise<Match[]>;
  listBySeason(seasonId: string): Promise<Match[]>;
}
