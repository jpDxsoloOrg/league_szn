import { registerDriver, type Repositories } from '../registry';
import { PostgresRosterRepository } from './PostgresRosterRepository';
import { createPostgresUnitOfWorkFactory } from './PostgresUnitOfWork';
import { notImplementedAggregate } from './notImplemented';
import type {
  CompetitionRepository,
  SeasonRepository,
  LeagueOpsRepository,
  ContentRepository,
  UserRepository,
} from '../index';

registerDriver('postgres', (): Repositories => ({
  roster: new PostgresRosterRepository(),
  competition: notImplementedAggregate<CompetitionRepository>('competition'),
  season: notImplementedAggregate<SeasonRepository>('season'),
  leagueOps: notImplementedAggregate<LeagueOpsRepository>('leagueOps'),
  content: notImplementedAggregate<ContentRepository>('content'),
  user: notImplementedAggregate<UserRepository>('user'),
  runInTransaction: createPostgresUnitOfWorkFactory(),
  clearAllData: async () => {
    throw new Error('PostgresDriver: clearAllData is not implemented yet.');
  },
  exportAllData: async () => {
    throw new Error('PostgresDriver: exportAllData is not implemented yet.');
  },
  importAllData: async () => {
    throw new Error('PostgresDriver: importAllData is not implemented yet.');
  },
}));
