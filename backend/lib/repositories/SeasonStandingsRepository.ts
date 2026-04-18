import type { SeasonStanding } from './types';

export interface SeasonStandingsRepository {
  listBySeason(seasonId: string): Promise<SeasonStanding[]>;
}
