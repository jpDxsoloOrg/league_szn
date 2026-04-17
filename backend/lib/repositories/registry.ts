import type { DivisionsRepository } from './DivisionsRepository';
import type { StipulationsRepository } from './StipulationsRepository';
import type { MatchTypesRepository } from './MatchTypesRepository';
import type { UnitOfWorkFactory } from './unitOfWork';

export interface Repositories {
  divisions: DivisionsRepository;
  stipulations: StipulationsRepository;
  matchTypes: MatchTypesRepository;
  runInTransaction: UnitOfWorkFactory;
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
