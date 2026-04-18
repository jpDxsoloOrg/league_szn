import type { SeasonStandingsRepository } from '../SeasonStandingsRepository';
import type { RecordDelta } from '../unitOfWork';
import type { SeasonStanding } from '../types';

export class InMemorySeasonStandingsRepository implements SeasonStandingsRepository {
  readonly store: SeasonStanding[] = [];

  async listBySeason(seasonId: string): Promise<SeasonStanding[]> {
    return this.store.filter((s) => s.seasonId === seasonId);
  }

  async findStanding(seasonId: string, playerId: string): Promise<SeasonStanding | null> {
    return this.store.find((s) => s.seasonId === seasonId && s.playerId === playerId) ?? null;
  }

  async increment(seasonId: string, playerId: string, delta: RecordDelta): Promise<void> {
    let standing = this.store.find((s) => s.seasonId === seasonId && s.playerId === playerId);
    if (!standing) {
      standing = { seasonId, playerId, wins: 0, losses: 0, draws: 0, updatedAt: new Date().toISOString() };
      this.store.push(standing);
    }
    if (delta.wins) standing.wins += delta.wins;
    if (delta.losses) standing.losses += delta.losses;
    if (delta.draws) standing.draws += delta.draws;
    standing.updatedAt = new Date().toISOString();
  }
}
