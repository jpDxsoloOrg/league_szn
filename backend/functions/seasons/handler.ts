import { createRouter, type RouteConfig, STAFF } from '../../lib/router';
import { handler as getSeasonsHandler } from './getSeasons';
import { handler as createSeasonHandler } from './createSeason';
import { handler as updateSeasonHandler } from './updateSeason';
import { handler as deleteSeasonHandler } from './deleteSeason';

/**
 * Single Lambda for seasons: routes by method + resource.
 */
export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/seasons',
    method: 'GET',
    handler: getSeasonsHandler,
    access: 'public',
  },
  {
    resource: '/seasons',
    method: 'POST',
    handler: createSeasonHandler,
    access: STAFF,
  },
  {
    resource: '/seasons/{seasonId}',
    method: 'PUT',
    handler: updateSeasonHandler,
    access: STAFF,
  },
  {
    resource: '/seasons/{seasonId}',
    method: 'DELETE',
    handler: deleteSeasonHandler,
    access: STAFF,
  },
];

export const handler = createRouter(routes);
