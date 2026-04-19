import { registerDriver, type Repositories } from '../registry';
import { InMemoryRosterRepository } from './InMemoryRosterRepository';
import { InMemoryCompetitionRepository } from './InMemoryCompetitionRepository';
import { InMemorySeasonRepository } from './InMemorySeasonRepository';
import { InMemoryLeagueOpsRepository } from './InMemoryLeagueOpsRepository';
import { InMemoryContentRepository } from './InMemoryContentRepository';
import { InMemoryUserRepository } from './InMemoryUserRepository';
import { InMemoryUnitOfWork } from './InMemoryUnitOfWork';

export function buildInMemoryRepositories(): Repositories {
  const roster = new InMemoryRosterRepository();
  const competition = new InMemoryCompetitionRepository();
  const season = new InMemorySeasonRepository();
  const leagueOps = new InMemoryLeagueOpsRepository();
  const content = new InMemoryContentRepository();
  const user = new InMemoryUserRepository();

  const runInTransaction: Repositories['runInTransaction'] = async <T>(fn: (tx: import('../unitOfWork').UnitOfWork) => Promise<T>): Promise<T> => {
    const uow = new InMemoryUnitOfWork({
      players: roster.playersStore as unknown as Map<string, Record<string, unknown>>,
      tagTeams: roster.tagTeamsStore as unknown as Map<string, Record<string, unknown>>,
      championships: competition.championshipsStore as unknown as Map<string, Record<string, unknown>>,
      championshipHistory: competition.historyStore as unknown as Array<Record<string, unknown>>,
      challenges: user.challengesStore as unknown as Map<string, Record<string, unknown>>,
      seasonStandings: season.standingsStore as unknown as Array<Record<string, unknown>>,
      matches: competition.matchesStore as unknown as Map<string, Record<string, unknown>>,
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
    roster,
    competition,
    season,
    leagueOps,
    content,
    user,
    runInTransaction,
    clearAllData: async () => {
      const counts: Record<string, { deleted: number; errors: number }> = {};
      const stores: [string, Map<unknown, unknown>][] = [
        ['players', roster.playersStore],
        ['tagTeams', roster.tagTeamsStore],
        ['championships', competition.championshipsStore],
        ['matches', competition.matchesStore],
        ['challenges', user.challengesStore],
      ];
      for (const [key, store] of stores) {
        counts[key] = { deleted: store.size, errors: 0 };
        store.clear();
      }
      competition.historyStore.length = 0;
      season.standingsStore.length = 0;
      return counts;
    },
    exportAllData: async () => {
      const data: Record<string, Record<string, unknown>[]> = {};
      data.players = Array.from(roster.playersStore.values()) as unknown as Record<string, unknown>[];
      data.matches = Array.from(competition.matchesStore.values()) as unknown as Record<string, unknown>[];
      data.championships = Array.from(competition.championshipsStore.values()) as unknown as Record<string, unknown>[];
      data.championshipHistory = competition.historyStore as unknown as Record<string, unknown>[];
      data.challenges = Array.from(user.challengesStore.values()) as unknown as Record<string, unknown>[];
      data.tagTeams = Array.from(roster.tagTeamsStore.values()) as unknown as Record<string, unknown>[];
      return data;
    },
    importAllData: async (importData: Record<string, Record<string, unknown>[]>) => {
      const counts: Record<string, number> = {};
      roster.playersStore.clear();
      competition.matchesStore.clear();
      competition.championshipsStore.clear();
      competition.historyStore.length = 0;
      user.challengesStore.clear();
      roster.tagTeamsStore.clear();
      season.standingsStore.length = 0;

      for (const [key, records] of Object.entries(importData)) {
        counts[key] = records.length;
        if (key === 'players') records.forEach(r => roster.playersStore.set(r.playerId as string, r as any));
        if (key === 'matches') records.forEach(r => competition.matchesStore.set(r.matchId as string, r as any));
        if (key === 'championships') records.forEach(r => competition.championshipsStore.set(r.championshipId as string, r as any));
        if (key === 'championshipHistory') records.forEach(r => competition.historyStore.push(r as any));
        if (key === 'challenges') records.forEach(r => user.challengesStore.set(r.challengeId as string, r as any));
        if (key === 'tagTeams') records.forEach(r => roster.tagTeamsStore.set(r.tagTeamId as string, r as any));
      }
      return counts;
    },
  };
}

registerDriver('memory', buildInMemoryRepositories);

// Export aggregate repos for testing
export { InMemoryRosterRepository } from './InMemoryRosterRepository';
export { InMemoryCompetitionRepository } from './InMemoryCompetitionRepository';
export { InMemorySeasonRepository } from './InMemorySeasonRepository';
export { InMemoryLeagueOpsRepository } from './InMemoryLeagueOpsRepository';
export { InMemoryContentRepository } from './InMemoryContentRepository';
export { InMemoryUserRepository } from './InMemoryUserRepository';
export { InMemoryUnitOfWork } from './InMemoryUnitOfWork';
