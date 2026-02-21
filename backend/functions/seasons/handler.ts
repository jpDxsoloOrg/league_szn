import { createRouter, type RouteConfig } from '../../lib/router';
import { handler as getSeasonsHandler } from './getSeasons';
import { handler as createSeasonHandler } from './createSeason';
import { handler as updateSeasonHandler } from './updateSeason';
import { handler as deleteSeasonHandler } from './deleteSeason';

/**
 * Single Lambda for seasons: routes by method + resource.
 */
const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/seasons',
    method: 'GET',
    handler: getSeasonsHandler,
  },
  {
    resource: '/seasons',
    method: 'POST',
    handler: createSeasonHandler,
  },
  {
    resource: '/seasons/{seasonId}',
    method: 'PUT',
    handler: updateSeasonHandler,
  },
  {
    resource: '/seasons/{seasonId}',
    method: 'DELETE',
    handler: deleteSeasonHandler,
  },
];

export const handler = createRouter(routes);
