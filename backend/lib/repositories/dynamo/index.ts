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
import { DynamoMatchmakingRepository } from './MatchmakingRepository';
import { createDynamoUnitOfWorkFactory } from './DynamoUnitOfWork';
import { dynamoClearAllData, dynamoExportAllData, dynamoImportAllData } from './adminOps';

registerDriver('dynamo', (): Repositories => ({
  roster: {
    players: new DynamoPlayersRepository(),
    tagTeams: new DynamoTagTeamsRepository(),
    stables: new DynamoStablesRepository(),
    overalls: new DynamoOverallsRepository(),
    transfers: new DynamoTransfersRepository(),
  },
  competition: {
    matches: new DynamoMatchesRepository(),
    championships: new DynamoChampionshipsRepository(),
    tournaments: new DynamoTournamentsRepository(),
    contenders: new DynamoContendersRepository(),
    matchTypes: new DynamoMatchTypesRepository(),
    stipulations: new DynamoStipulationsRepository(),
  },
  season: {
    seasons: new DynamoSeasonsRepository(),
    seasonStandings: new DynamoSeasonStandingsRepository(),
    seasonAwards: new DynamoSeasonAwardsRepository(),
  },
  leagueOps: {
    events: new DynamoEventsRepository(),
    shows: new DynamoShowsRepository(),
    companies: new DynamoCompaniesRepository(),
    divisions: new DynamoDivisionsRepository(),
    matchmaking: new DynamoMatchmakingRepository(),
  },
  content: {
    announcements: new DynamoAnnouncementsRepository(),
    videos: new DynamoVideosRepository(),
    promos: new DynamoPromosRepository(),
    storylineRequests: new DynamoStorylineRequestsRepository(),
  },
  user: {
    notifications: new DynamoNotificationsRepository(),
    challenges: new DynamoChallengesRepository(),
    fantasy: new DynamoFantasyRepository(),
    siteConfig: new DynamoSiteConfigRepository(),
  },
  runInTransaction: createDynamoUnitOfWorkFactory(),
  clearAllData: dynamoClearAllData,
  exportAllData: dynamoExportAllData,
  importAllData: dynamoImportAllData,
}));
