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
import { DynamoPlayersRepository } from './PlayersRepository';
import { DynamoChallengesRepository } from './ChallengesRepository';
import { DynamoTagTeamsRepository } from './TagTeamsRepository';
import { DynamoStablesRepository } from './StablesRepository';
import { DynamoTransfersRepository } from './TransfersRepository';
import { DynamoStorylineRequestsRepository } from './StorylineRequestsRepository';
import { DynamoEventsRepository } from './EventsRepository';
import { DynamoPromosRepository } from './PromosRepository';
import { DynamoMatchesRepository } from './MatchesRepository';
import { DynamoChampionshipsRepository } from './ChampionshipsRepository';
import { DynamoTournamentsRepository } from './TournamentsRepository';
import { DynamoSeasonStandingsRepository } from './SeasonStandingsRepository';
import { DynamoContendersRepository } from './ContendersRepository';
import { DynamoFantasyRepository } from './FantasyRepository';
import { createDynamoUnitOfWorkFactory } from './DynamoUnitOfWork';
import { dynamoClearAllData, dynamoExportAllData, dynamoImportAllData } from './adminOps';

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
  players: new DynamoPlayersRepository(),
  challenges: new DynamoChallengesRepository(),
  tagTeams: new DynamoTagTeamsRepository(),
  stables: new DynamoStablesRepository(),
  transfers: new DynamoTransfersRepository(),
  storylineRequests: new DynamoStorylineRequestsRepository(),
  events: new DynamoEventsRepository(),
  promos: new DynamoPromosRepository(),
  matches: new DynamoMatchesRepository(),
  championships: new DynamoChampionshipsRepository(),
  tournaments: new DynamoTournamentsRepository(),
  seasonStandings: new DynamoSeasonStandingsRepository(),
  contenders: new DynamoContendersRepository(),
  fantasy: new DynamoFantasyRepository(),
  runInTransaction: createDynamoUnitOfWorkFactory(),
  clearAllData: dynamoClearAllData,
  exportAllData: dynamoExportAllData,
  importAllData: dynamoImportAllData,
}));
