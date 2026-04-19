import type { PlayersRepository } from './PlayersRepository';
import type { TagTeamsRepository } from './TagTeamsRepository';
import type { StablesRepository } from './StablesRepository';
import type { OverallsRepository } from './OverallsRepository';
import type { TransfersRepository } from './TransfersRepository';
import type { MatchesRepository } from './MatchesRepository';
import type { ChampionshipsRepository } from './ChampionshipsRepository';
import type { TournamentsRepository } from './TournamentsRepository';
import type { ContendersRepository } from './ContendersRepository';
import type { MatchTypesRepository } from './MatchTypesRepository';
import type { StipulationsRepository } from './StipulationsRepository';
import type { SeasonsRepository } from './SeasonsRepository';
import type { SeasonStandingsRepository } from './SeasonStandingsRepository';
import type { SeasonAwardsRepository } from './SeasonAwardsRepository';
import type { EventsRepository } from './EventsRepository';
import type { ShowsRepository } from './ShowsRepository';
import type { CompaniesRepository } from './CompaniesRepository';
import type { DivisionsRepository } from './DivisionsRepository';
import type { MatchmakingRepository } from './MatchmakingRepository';
import type { AnnouncementsRepository } from './AnnouncementsRepository';
import type { VideosRepository } from './VideosRepository';
import type { PromosRepository } from './PromosRepository';
import type { StorylineRequestsRepository } from './StorylineRequestsRepository';
import type { NotificationsRepository } from './NotificationsRepository';
import type { ChallengesRepository } from './ChallengesRepository';
import type { FantasyRepository } from './FantasyRepository';
import type { SiteConfigRepository } from './SiteConfigRepository';

export interface RosterAggregate {
  players: PlayersRepository;
  tagTeams: TagTeamsRepository;
  stables: StablesRepository;
  overalls: OverallsRepository;
  transfers: TransfersRepository;
}

export interface CompetitionAggregate {
  matches: MatchesRepository;
  championships: ChampionshipsRepository;
  tournaments: TournamentsRepository;
  contenders: ContendersRepository;
  matchTypes: MatchTypesRepository;
  stipulations: StipulationsRepository;
}

export interface SeasonAggregate {
  seasons: SeasonsRepository;
  seasonStandings: SeasonStandingsRepository;
  seasonAwards: SeasonAwardsRepository;
}

export interface LeagueOpsAggregate {
  events: EventsRepository;
  shows: ShowsRepository;
  companies: CompaniesRepository;
  divisions: DivisionsRepository;
  matchmaking: MatchmakingRepository;
}

export interface ContentAggregate {
  announcements: AnnouncementsRepository;
  videos: VideosRepository;
  promos: PromosRepository;
  storylineRequests: StorylineRequestsRepository;
}

export interface UserAggregate {
  notifications: NotificationsRepository;
  challenges: ChallengesRepository;
  fantasy: FantasyRepository;
  siteConfig: SiteConfigRepository;
}
