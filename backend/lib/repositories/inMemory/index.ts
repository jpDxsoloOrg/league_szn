import { registerDriver, type Repositories } from '../registry';
import { InMemoryDivisionsRepository } from './DivisionsRepository';
import { InMemoryStipulationsRepository } from './StipulationsRepository';
import { InMemoryMatchTypesRepository } from './MatchTypesRepository';
import { InMemorySiteConfigRepository } from './SiteConfigRepository';
import { InMemoryVideosRepository } from './VideosRepository';
import { InMemoryAnnouncementsRepository } from './AnnouncementsRepository';
import { InMemoryCompaniesRepository } from './CompaniesRepository';
import { InMemoryShowsRepository } from './ShowsRepository';
import { InMemoryNotificationsRepository } from './NotificationsRepository';
import { InMemoryOverallsRepository } from './OverallsRepository';
import { InMemorySeasonsRepository } from './SeasonsRepository';
import { InMemorySeasonAwardsRepository } from './SeasonAwardsRepository';

export function buildInMemoryRepositories(): Repositories {
  return {
    divisions: new InMemoryDivisionsRepository(),
    stipulations: new InMemoryStipulationsRepository(),
    matchTypes: new InMemoryMatchTypesRepository(),
    siteConfig: new InMemorySiteConfigRepository(),
    videos: new InMemoryVideosRepository(),
    announcements: new InMemoryAnnouncementsRepository(),
    companies: new InMemoryCompaniesRepository(),
    shows: new InMemoryShowsRepository(),
    notifications: new InMemoryNotificationsRepository(),
    overalls: new InMemoryOverallsRepository(),
    seasons: new InMemorySeasonsRepository(),
    seasonAwards: new InMemorySeasonAwardsRepository(),
    runInTransaction: async () => {
      throw new Error('runInTransaction is not implemented in the in-memory driver yet (scheduled for Wave 7)');
    },
  };
}

registerDriver('memory', buildInMemoryRepositories);

export { InMemoryDivisionsRepository } from './DivisionsRepository';
export { InMemoryStipulationsRepository } from './StipulationsRepository';
export { InMemoryMatchTypesRepository } from './MatchTypesRepository';
export { InMemorySiteConfigRepository } from './SiteConfigRepository';
export { InMemoryVideosRepository } from './VideosRepository';
export { InMemoryAnnouncementsRepository } from './AnnouncementsRepository';
export { InMemoryCompaniesRepository } from './CompaniesRepository';
export { InMemoryShowsRepository } from './ShowsRepository';
export { InMemoryNotificationsRepository } from './NotificationsRepository';
export { InMemoryOverallsRepository } from './OverallsRepository';
export { InMemorySeasonsRepository } from './SeasonsRepository';
export { InMemorySeasonAwardsRepository } from './SeasonAwardsRepository';
