import type { DivisionsRepository } from './DivisionsRepository';
import type { StipulationsRepository } from './StipulationsRepository';
import type { MatchTypesRepository } from './MatchTypesRepository';
import type { SiteConfigRepository } from './SiteConfigRepository';
import type { VideosRepository } from './VideosRepository';
import type { AnnouncementsRepository } from './AnnouncementsRepository';
import type { CompaniesRepository } from './CompaniesRepository';
import type { ShowsRepository } from './ShowsRepository';
import type { NotificationsRepository } from './NotificationsRepository';
import type { OverallsRepository } from './OverallsRepository';
import type { SeasonsRepository } from './SeasonsRepository';
import type { SeasonAwardsRepository } from './SeasonAwardsRepository';
import type { UnitOfWorkFactory } from './unitOfWork';

export interface Repositories {
  divisions: DivisionsRepository;
  stipulations: StipulationsRepository;
  matchTypes: MatchTypesRepository;
  siteConfig: SiteConfigRepository;
  videos: VideosRepository;
  announcements: AnnouncementsRepository;
  companies: CompaniesRepository;
  shows: ShowsRepository;
  notifications: NotificationsRepository;
  overalls: OverallsRepository;
  seasons: SeasonsRepository;
  seasonAwards: SeasonAwardsRepository;
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
