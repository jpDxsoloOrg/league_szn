import { registerDriver, type Repositories } from '../registry';
import { DynamoDivisionsRepository } from './DivisionsRepository';
import { DynamoStipulationsRepository } from './StipulationsRepository';
import { DynamoMatchTypesRepository } from './MatchTypesRepository';
import { DynamoSiteConfigRepository } from './SiteConfigRepository';
import { DynamoVideosRepository } from './VideosRepository';
import { DynamoAnnouncementsRepository } from './AnnouncementsRepository';
import { DynamoCompaniesRepository } from './CompaniesRepository';
import { DynamoShowsRepository } from './ShowsRepository';
import { DynamoNotificationsRepository } from './NotificationsRepository';
import { DynamoOverallsRepository } from './OverallsRepository';
import { DynamoSeasonsRepository } from './SeasonsRepository';
import { DynamoSeasonAwardsRepository } from './SeasonAwardsRepository';

registerDriver('dynamo', (): Repositories => ({
  divisions: new DynamoDivisionsRepository(),
  stipulations: new DynamoStipulationsRepository(),
  matchTypes: new DynamoMatchTypesRepository(),
  siteConfig: new DynamoSiteConfigRepository(),
  videos: new DynamoVideosRepository(),
  announcements: new DynamoAnnouncementsRepository(),
  companies: new DynamoCompaniesRepository(),
  shows: new DynamoShowsRepository(),
  notifications: new DynamoNotificationsRepository(),
  overalls: new DynamoOverallsRepository(),
  seasons: new DynamoSeasonsRepository(),
  seasonAwards: new DynamoSeasonAwardsRepository(),
  runInTransaction: async () => {
    throw new Error('runInTransaction is not implemented in the dynamo driver yet (scheduled for Wave 7)');
  },
}));
