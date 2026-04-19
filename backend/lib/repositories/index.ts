import './dynamo';
import './inMemory';

export {
  registerDriver,
  getRepositories,
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from './registry';
export * from './errors';
export * from './unitOfWork';
export * from './types';

// Aggregate repository interfaces and their input types
export type { CrudRepository } from './CrudRepository';

export type {
  RosterRepository,
  PlayerCreateInput,
  PlayerPatch,
  TagTeamCreateInput,
  TagTeamPatch,
  StableCreateInput,
  StablePatch,
  StableInvitationCreateInput,
  OverallSubmitInput,
  JoinedOverall,
  TransferCreateInput,
  TransferReviewInput,
  StablesMethods,
  OverallsMethods,
  TransfersMethods,
} from './RosterRepository';

export type {
  CompetitionRepository,
  ChampionshipCreateInput,
  ChampionshipPatch,
  ContenderRankingInput,
  ContenderOverrideInput,
  RankingHistoryInput,
  MatchTypeCreateInput,
  MatchTypePatch,
  StipulationCreateInput,
  StipulationPatch,
  MatchesMethods,
  ChampionshipsMethods,
  TournamentsMethods,
  ContendersMethods,
} from './CompetitionRepository';

export type {
  SeasonRepository,
  SeasonCreateInput,
  SeasonPatch,
  SeasonAwardCreateInput,
  StandingsMethods,
  AwardsMethods,
} from './SeasonRepository';

export type {
  LeagueOpsRepository,
  EventCreateInput,
  EventPatch,
  ShowCreateInput,
  ShowPatch,
  CompanyCreateInput,
  CompanyPatch,
  DivisionCreateInput,
  DivisionPatch,
  PresenceRecord,
  QueueRecord,
  InvitationRecord,
  MatchmakingMethods,
} from './LeagueOpsRepository';

export type {
  ContentRepository,
  AnnouncementCreateInput,
  AnnouncementPatch,
  VideoCreateInput,
  VideoPatch,
  PromoCreateInput,
  StorylineRequestCreateInput,
  StorylineRequestReviewInput,
  PromosMethods,
  StorylineRequestsMethods,
} from './ContentRepository';

export type {
  UserRepository,
  NotificationPage,
  ChallengeCreateInput,
  FantasyPickInput,
  WrestlerCostInitInput,
  NotificationsMethods,
  FantasyMethods,
  SiteConfigMethods,
} from './UserRepository';

// SiteConfigRepository kept for FeatureFlags and DEFAULT_FEATURES
export type { FeatureFlags } from './SiteConfigRepository';
export { DEFAULT_FEATURES } from './SiteConfigRepository';
