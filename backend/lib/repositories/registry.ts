import type {
  RosterAggregate,
  CompetitionAggregate,
  SeasonAggregate,
  LeagueOpsAggregate,
  ContentAggregate,
  UserAggregate,
} from './aggregates';
import type { UnitOfWorkFactory } from './unitOfWork';

export interface Repositories {
  roster: RosterAggregate;
  competition: CompetitionAggregate;
  season: SeasonAggregate;
  leagueOps: LeagueOpsAggregate;
  content: ContentAggregate;
  user: UserAggregate;
  runInTransaction: UnitOfWorkFactory;

  // Admin bulk operations
  clearAllData(): Promise<Record<string, { deleted: number; errors: number }>>;
  exportAllData(): Promise<Record<string, Record<string, unknown>[]>>;
  importAllData(data: Record<string, Record<string, unknown>[]>): Promise<Record<string, number>>;
}

type RepositoriesFactory = () => Repositories;

const drivers: Record<string, RepositoriesFactory> = {};

export function registerDriver(name: string, factory: RepositoriesFactory): void {
  drivers[name] = factory;
}

let cached: Repositories | undefined;

export function getRepositories(): Repositories {
  if (cached) return cached;

  const driverName = process.env.DB_DRIVER || 'dynamo';
  const factory = drivers[driverName];
  if (!factory) {
    throw new Error(
      `No repository driver registered for DB_DRIVER="${driverName}". ` +
        `Registered drivers: [${Object.keys(drivers).join(', ') || 'none'}]`,
    );
  }

  cached = factory();
  return cached;
}

export function setRepositoriesForTesting(repos: Repositories): void {
  cached = repos;
}

export function resetRepositoriesForTesting(): void {
  cached = undefined;
}
