/**
 * The merged route table served by the single `api` Lambda behind
 * `ANY /{proxy+}` (INFRA-207, docs/plans/plan-infra-207-api-simplification.md).
 *
 * Every domain keeps its own `routes` export; this file only concatenates
 * them, plus LEGACY_ENTRY_ROUTES for the HTTP entry points that never had a
 * route table. Adding an endpoint is a route entry here (or in a domain
 * table) and a test: no CloudFormation or API Gateway resource.
 */
import type { RouteConfig } from '../../lib/router';
import { routes as adminRoutes } from '../admin/handler';
import { routes as announcementsRoutes } from '../announcements/handler';
import { routes as challengesRoutes } from '../challenges/handler';
import { routes as championshipsRoutes } from '../championships/handler';
import { routes as companiesRoutes } from '../companies/handler';
import { routes as contendersRoutes } from '../contenders/handler';
import { routes as contractsRoutes } from '../contracts/handler';
import { routes as dashboardRoutes } from '../dashboard/handler';
import { routes as divisionsRoutes } from '../divisions/handler';
import { routes as episodesRoutes } from '../episodes/handler';
import { routes as eventsRoutes } from '../events/handler';
import { routes as injuriesRoutes } from '../injuries/handler';
import { routes as liveStreamRoutes } from '../liveStream/handler';
import { routes as locationsRoutes } from '../locations/handler';
import { routes as matchesRoutes } from '../matches/handler';
import { routes as matchTypesRoutes } from '../matchTypes/handler';
import { routes as notificationsRoutes } from '../notifications/handler';
import { routes as overallsRoutes } from '../overalls/handler';
import { routes as playersRoutes } from '../players/handler';
import { routes as progressionRoutes } from '../progression/handler';
import { routes as promosRoutes } from '../promos/handler';
import { routes as rivalryRequestsRoutes } from '../rivalries/handler';
import { routes as rivalryMessagesRoutes } from '../rivalries/messages/handler';
import { routes as rivalryNotesRoutes } from '../rivalries/notes/handler';
import { routes as seasonAwardsRoutes } from '../seasonAwards/handler';
import { routes as seasonsRoutes } from '../seasons/handler';
import { routes as showsRoutes } from '../shows/handler';
import { routes as stablesRoutes } from '../stables/handler';
import { routes as stipulationsRoutes } from '../stipulations/handler';
import { routes as storylineRequestsRoutes } from '../storylineRequests/handler';
import { routes as tagTeamsRoutes } from '../tagTeams/handler';
import { routes as tournamentsRoutes } from '../tournaments/handler';
import { routes as transfersRoutes } from '../transfers/handler';
import { routes as usersRoutes } from '../users/handler';
import { routes as videosRoutes } from '../videos/handler';
import { routes as wrestlersRoutes } from '../wrestlers/handler';
import { handler as getActivityHandler } from '../activity/handler';
import { handler as serveDocsHandler } from '../docs/serveDocs';
import { handler as generateUploadUrlHandler } from '../images/generateUploadUrl';
import { handler as getMatchHistoryRivalriesHandler } from '../rivalries/getMatchHistoryRivalries';
import { handler as getRivalryActivityHandler } from '../rivalries/getRivalryActivity';
import { handler as getStandingsHandler } from '../standings/getStandings';
import { handler as getStatisticsHandler } from '../statistics/getStatistics';

/**
 * HTTP entry points that were deployed as their own functions without a route
 * table (plan section 5.1). Their access matches what the gateway enforced:
 * the reads were open, and the upload URL sat behind the gateway authorizer
 * with a Wrestler role check (Admin and Moderator pass through hasRole).
 */
export const LEGACY_ENTRY_ROUTES: ReadonlyArray<RouteConfig> = [
  // Optional caller: getStandings widens its view through getVerifiedCaller.
  { resource: '/standings', method: 'GET', handler: getStandingsHandler, access: 'public' },
  { resource: '/activity', method: 'GET', handler: getActivityHandler, access: 'public' },
  { resource: '/statistics', method: 'GET', handler: getStatisticsHandler, access: 'public' },
  { resource: '/rivalries', method: 'GET', handler: getMatchHistoryRivalriesHandler, access: 'public' },
  { resource: '/rivalries/activity', method: 'GET', handler: getRivalryActivityHandler, access: 'public' },
  // serveDocs picks the spec when event.path ends with /spec.
  { resource: '/api-docs', method: 'GET', handler: serveDocsHandler, access: 'public' },
  { resource: '/api-docs/spec', method: 'GET', handler: serveDocsHandler, access: 'public' },
  { resource: '/images/upload-url', method: 'POST', handler: generateUploadUrlHandler, access: { roles: ['Wrestler'] } },
];

/** Every domain table, in the order the functions were declared in serverless.yml. */
const DOMAIN_ROUTE_TABLES: ReadonlyArray<ReadonlyArray<RouteConfig>> = [
  usersRoutes,
  adminRoutes,
  playersRoutes,
  overallsRoutes,
  transfersRoutes,
  storylineRequestsRoutes,
  matchesRoutes,
  championshipsRoutes,
  tournamentsRoutes,
  dashboardRoutes,
  seasonsRoutes,
  seasonAwardsRoutes,
  companiesRoutes,
  showsRoutes,
  locationsRoutes,
  divisionsRoutes,
  wrestlersRoutes,
  stipulationsRoutes,
  matchTypesRoutes,
  eventsRoutes,
  contendersRoutes,
  progressionRoutes,
  rivalryMessagesRoutes,
  rivalryNotesRoutes,
  rivalryRequestsRoutes,
  contractsRoutes,
  injuriesRoutes,
  challengesRoutes,
  promosRoutes,
  stablesRoutes,
  tagTeamsRoutes,
  videosRoutes,
  episodesRoutes,
  liveStreamRoutes,
  announcementsRoutes,
  notificationsRoutes,
];

export const allRoutes: ReadonlyArray<RouteConfig> = [
  ...DOMAIN_ROUTE_TABLES.flat(),
  ...LEGACY_ENTRY_ROUTES,
];
