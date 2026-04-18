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
import { InMemoryPlayersRepository } from './PlayersRepository';
import { InMemoryChallengesRepository } from './ChallengesRepository';
import { InMemoryTagTeamsRepository } from './TagTeamsRepository';
import { InMemoryStablesRepository } from './StablesRepository';
import { InMemoryTransfersRepository } from './TransfersRepository';
import { InMemoryStorylineRequestsRepository } from './StorylineRequestsRepository';
import { InMemoryEventsRepository } from './EventsRepository';
import { InMemoryPromosRepository } from './PromosRepository';
import { InMemoryMatchesRepository } from './MatchesRepository';
import { InMemoryChampionshipsRepository } from './ChampionshipsRepository';
import { InMemoryTournamentsRepository } from './TournamentsRepository';
import { InMemorySeasonStandingsRepository } from './SeasonStandingsRepository';
import { InMemoryContendersRepository } from './ContendersRepository';
import { InMemoryFantasyRepository } from './FantasyRepository';

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
    players: new InMemoryPlayersRepository(),
    challenges: new InMemoryChallengesRepository(),
    tagTeams: new InMemoryTagTeamsRepository(),
    stables: new InMemoryStablesRepository(),
    transfers: new InMemoryTransfersRepository(),
    storylineRequests: new InMemoryStorylineRequestsRepository(),
    events: new InMemoryEventsRepository(),
    promos: new InMemoryPromosRepository(),
    matches: new InMemoryMatchesRepository(),
    championships: new InMemoryChampionshipsRepository(),
    tournaments: new InMemoryTournamentsRepository(),
    seasonStandings: new InMemorySeasonStandingsRepository(),
    contenders: new InMemoryContendersRepository(),
    fantasy: new InMemoryFantasyRepository(),
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
export { InMemoryPlayersRepository } from './PlayersRepository';
export { InMemoryChallengesRepository } from './ChallengesRepository';
export { InMemoryTagTeamsRepository } from './TagTeamsRepository';
export { InMemoryStablesRepository } from './StablesRepository';
export { InMemoryTransfersRepository } from './TransfersRepository';
export { InMemoryStorylineRequestsRepository } from './StorylineRequestsRepository';
export { InMemoryEventsRepository } from './EventsRepository';
export { InMemoryPromosRepository } from './PromosRepository';
export { InMemoryMatchesRepository } from './MatchesRepository';
export { InMemoryChampionshipsRepository } from './ChampionshipsRepository';
export { InMemoryTournamentsRepository } from './TournamentsRepository';
export { InMemorySeasonStandingsRepository } from './SeasonStandingsRepository';
export { InMemoryContendersRepository } from './ContendersRepository';
export { InMemoryFantasyRepository } from './FantasyRepository';
