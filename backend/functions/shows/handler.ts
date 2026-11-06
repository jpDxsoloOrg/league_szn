import { handler as getShowsHandler } from './getShows';
import { handler as getShowHandler } from './getShow';
import { handler as createShowHandler } from './createShow';
import { handler as updateShowHandler } from './updateShow';
import { handler as deleteShowHandler } from './deleteShow';
import { createRouter, type RouteConfig, STAFF } from '../../lib/router';

export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/shows',
    method: 'GET',
    handler: getShowsHandler,
    access: 'public',
  },
  {
    resource: '/shows',
    method: 'POST',
    handler: createShowHandler,
    access: STAFF,
  },
  {
    resource: '/shows/{showId}',
    method: 'GET',
    handler: getShowHandler,
    access: 'public',
  },
  {
    resource: '/shows/{showId}',
    method: 'PUT',
    handler: updateShowHandler,
    access: STAFF,
  },
  {
    resource: '/shows/{showId}',
    method: 'DELETE',
    handler: deleteShowHandler,
    access: STAFF,
  },
];
export const handler = createRouter(routes);
