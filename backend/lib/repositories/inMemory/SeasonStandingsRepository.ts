import type { SeasonStandingsRepository } from '../SeasonStandingsRepository';
import type { SeasonStanding } from '../types';

export class InMemorySeasonStandingsRepository implements SeasonStandingsRepository {
  readonly store: SeasonStanding[] = [];

  async listBySeason(seasonId: string): Promise<SeasonStanding[]> {
    return this.store.filter((s) => s.seasonId === seasonId);
  }
}
