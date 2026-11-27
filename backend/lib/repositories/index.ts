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
  EventUpdateOptions,
  ShowCreateInput,
  ShowPatch,
  CompanyCreateInput,
  CompanyPatch,
  DivisionCreateInput,
  DivisionPatch,
  LocationCreateInput,
  LocationPatch,
  LocationBulkImportResult,
  LocationsMethods,
} from './LeagueOpsRepository';

export type {
  ContentRepository,
  AnnouncementCreateInput,
  AnnouncementPatch,
  TickerMessageCreateInput,
  TickerMessagePatch,
  TickerMessagesMethods,
  VideoCreateInput,
  VideoPatch,
  VideosMethods,
  EpisodeCreateInput,
  EpisodePatch,
  EpisodesMethods,
  PromoCreateInput,
  StorylineRequestCreateInput,
  StorylineRequestReviewInput,
  PromosMethods,
  StorylineRequestsMethods,
} from './ContentRepository';
export {
  TICKER_KIND,
  TICKER_TEXT_MAX_LENGTH,
  isTickerMessageActive,
  compareTickerMessages,
  compareEpisodes,
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
export type { FeatureFlags, LiveStreamSettings, TickerSettings, TickerScrollSpeed } from './SiteConfigRepository';
export { DEFAULT_FEATURES, DEFAULT_LIVE_STREAM, DEFAULT_TICKER_SETTINGS, TICKER_SCROLL_SPEEDS } from './SiteConfigRepository';

export type {
  FactionMessage,
  FactionMessageType,
  FactionMessagePostInput,
  FactionDirectMessage,
  FactionDirectMessagePostInput,
  FactionDirectThreadSummary,
  FactionMessagesRepository,
  FactionDirectMessagesRepository,
  ListPage,
  ListPageOptions,
} from './factionMessages';
export { buildThreadKey } from './factionMessages';

export type {
  Rivalry,
  RivalryStatus,
  RivalryHeat,
  RivalryParticipant,
  RivalryParticipantRole,
  WrestlerVariant,
  RivalryMessage,
  RivalryMessageAudience,
  RivalryMessagePostInput,
  RivalryNote,
  RivalryNoteType,
  RivalryNoteVisibility,
  RivalryNoteCreateInput,
  RivalryNotePatch,
  CreateRivalryInput,
  RivalryPatch,
  RivalriesRepository,
  RivalryMessagesRepository,
  RivalryNotesRepository,
  RivalryActivityKind,
  RivalryActivityItem,
  RivalryMessageActivityItem,
  RivalryPromoActivityItem,
  RivalryMatchActivityItem,
  RivalryNoteActivityItem,
  RivalryActivityPage,
} from './rivalries';
export { participantSk, RIVALRY_META_SK } from './rivalries';

export type {
  MatchRatingsRepository,
  MatchRatingCreateInput,
} from './matchRatings';
export { RatingAlreadyExistsError } from './matchRatings';

export type {
  ProgressionRepository,
  ProgressionTrackFilter,
  ListByTrackOptions,
  ListProgressionEventsOptions,
} from './progression';
export { progressionEventSortKey } from './progression';

export type {
  LedgerEntry,
  LedgerEntryKind,
  LedgerIdempotencyRecord,
  LedgerPage,
  LedgerRef,
  LedgerRepository,
  PostLedgerEntryInput,
  StagedLedgerEntry,
} from './ledger';
export {
  DuplicatePostingError,
  InvalidLedgerPostingError,
  LEDGER_ENTRY_KINDS,
  ledgerSortKey,
} from './ledger';

// ECO-09
export type {
  GmInterferenceListFilter,
  GmInterferenceOutcome,
  GmInterferenceRepository,
  GmInterferenceRequest,
  GmInterferenceResolution,
  GmInterferenceStatus,
  PlayerGmInterferenceView,
} from './gmInterference';
export {
  GM_INTERFERENCE_OUTCOMES,
  GM_INTERFERENCE_STATUSES,
  toPlayerGmInterferenceView,
} from './gmInterference';

// INJ-03
export type {
  CurrentInjury,
  InjuriesRepository,
  Injury,
  InjuryChange,
  InjuryChangeKind,
  InjuryEndedReason,
  InjuryPatch,
  InjurySeverity,
  InjurySource,
  PlayerConditionGuard,
  PlayerConditionPatch,
  PublicCurrentInjury,
  PublicInjury,
} from './injuries';
export {
  INJURY_ENDED_REASONS,
  INJURY_SEVERITIES,
  InvalidInjuryWriteError,
  hasGmEdits,
  injuryRowId,
  isInjurySeverity,
  toCurrentInjury,
  toPublicCurrentInjury,
  toPublicInjury,
  toPublicInjuryHistory,
} from './injuries';

export type {
  ContractsRepository,
  ContractCreateInput,
  ContractListFilter,
} from './contracts';
export { buildContract } from './contracts';
