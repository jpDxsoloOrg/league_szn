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
import { InMemoryMatchmakingRepository } from './MatchmakingRepository';
import { InMemoryUnitOfWork } from './InMemoryUnitOfWork';

export function buildInMemoryRepositories(): Repositories {
  const playersRepo = new InMemoryPlayersRepository();
  const challengesRepo = new InMemoryChallengesRepository();
  const tagTeamsRepo = new InMemoryTagTeamsRepository();
  const championshipsRepo = new InMemoryChampionshipsRepository();
  const matchesRepo = new InMemoryMatchesRepository();
  const seasonStandingsRepo = new InMemorySeasonStandingsRepository();

  const runInTransaction: Repositories['runInTransaction'] = async <T>(fn: (tx: import('../unitOfWork').UnitOfWork) => Promise<T>): Promise<T> => {
    const uow = new InMemoryUnitOfWork({
      players: playersRepo.store as unknown as Map<string, Record<string, unknown>>,
      tagTeams: tagTeamsRepo.store as unknown as Map<string, Record<string, unknown>>,
      championships: championshipsRepo.store as unknown as Map<string, Record<string, unknown>>,
      championshipHistory: championshipsRepo.historyStore as unknown as Array<Record<string, unknown>>,
      challenges: challengesRepo.store as unknown as Map<string, Record<string, unknown>>,
      seasonStandings: seasonStandingsRepo.store as unknown as Array<Record<string, unknown>>,
      matches: matchesRepo.store as unknown as Map<string, Record<string, unknown>>,
    });
    try {
      const result = await fn(uow);
      await uow.commit();
      return result;
    } catch (err) {
      await uow.rollback();
      throw err;
    }
  };

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
    players: playersRepo,
    challenges: challengesRepo,
    tagTeams: tagTeamsRepo,
    stables: new InMemoryStablesRepository(),
    transfers: new InMemoryTransfersRepository(),
    storylineRequests: new InMemoryStorylineRequestsRepository(),
    events: new InMemoryEventsRepository(),
    promos: new InMemoryPromosRepository(),
    matches: matchesRepo,
    championships: championshipsRepo,
    tournaments: new InMemoryTournamentsRepository(),
    seasonStandings: seasonStandingsRepo,
    contenders: new InMemoryContendersRepository(),
    fantasy: new InMemoryFantasyRepository(),
    matchmaking: new InMemoryMatchmakingRepository(),
    runInTransaction,
    clearAllData: async () => {
      const counts: Record<string, { deleted: number; errors: number }> = {};
      const stores: [string, Map<unknown, unknown> | unknown[]][] = [
        ['players', playersRepo.store],
        ['challenges', challengesRepo.store],
        ['tagTeams', tagTeamsRepo.store],
        ['championships', championshipsRepo.store],
        ['matches', matchesRepo.store],
      ];
      for (const [key, store] of stores) {
        if (store instanceof Map) {
          counts[key] = { deleted: store.size, errors: 0 };
          store.clear();
        } else if (Array.isArray(store)) {
          counts[key] = { deleted: store.length, errors: 0 };
          store.length = 0;
        }
      }
      championshipsRepo.historyStore.length = 0;
      seasonStandingsRepo.store.length = 0;
      return counts;
    },
    exportAllData: async () => {
      const data: Record<string, Record<string, unknown>[]> = {};
      data.players = Array.from(playersRepo.store.values()) as unknown as Record<string, unknown>[];
      data.matches = Array.from(matchesRepo.store.values()) as unknown as Record<string, unknown>[];
      data.championships = Array.from(championshipsRepo.store.values()) as unknown as Record<string, unknown>[];
      data.championshipHistory = championshipsRepo.historyStore as unknown as Record<string, unknown>[];
      data.challenges = Array.from(challengesRepo.store.values()) as unknown as Record<string, unknown>[];
      data.tagTeams = Array.from(tagTeamsRepo.store.values()) as unknown as Record<string, unknown>[];
      return data;
    },
    importAllData: async (data: Record<string, Record<string, unknown>[]>) => {
      const counts: Record<string, number> = {};
      // Clear everything first
      playersRepo.store.clear();
      matchesRepo.store.clear();
      championshipsRepo.store.clear();
      championshipsRepo.historyStore.length = 0;
      challengesRepo.store.clear();
      tagTeamsRepo.store.clear();
      seasonStandingsRepo.store.length = 0;

      // Import
      for (const [key, records] of Object.entries(data)) {
        counts[key] = records.length;
         
        if (key === 'players') records.forEach(r => playersRepo.store.set(r.playerId as string, r as any));
         
        if (key === 'matches') records.forEach(r => matchesRepo.store.set(r.matchId as string, r as any));
         
        if (key === 'championships') records.forEach(r => championshipsRepo.store.set(r.championshipId as string, r as any));
         
        if (key === 'championshipHistory') records.forEach(r => championshipsRepo.historyStore.push(r as any));
         
        if (key === 'challenges') records.forEach(r => challengesRepo.store.set(r.challengeId as string, r as any));
         
        if (key === 'tagTeams') records.forEach(r => tagTeamsRepo.store.set(r.tagTeamId as string, r as any));
      }
      return counts;
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
export { InMemoryMatchmakingRepository } from './MatchmakingRepository';
export { InMemoryUnitOfWork } from './InMemoryUnitOfWork';
