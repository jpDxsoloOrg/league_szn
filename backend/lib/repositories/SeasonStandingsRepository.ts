import type { SeasonStanding } from './types';
import type { RecordDelta } from './unitOfWork';

export interface SeasonStandingsRepository {
  listBySeason(seasonId: string): Promise<SeasonStanding[]>;
  findStanding(seasonId: string, playerId: string): Promise<SeasonStanding | null>;
  increment(seasonId: string, playerId: string, delta: RecordDelta): Promise<void>;
}
