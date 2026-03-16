import { handler as getShowsHandler } from './getShows';
import { handler as getShowHandler } from './getShow';
import { handler as createShowHandler } from './createShow';
import { handler as updateShowHandler } from './updateShow';
import { handler as deleteShowHandler } from './deleteShow';
import { createRouter, RouteConfig } from '../../lib/router';

const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/shows',
    method: 'GET',
    handler: getShowsHandler,
  },
  {
    resource: '/shows',
    method: 'POST',
    handler: createShowHandler,
  },
  {
    resource: '/shows/{showId}',
    method: 'GET',
    handler: getShowHandler,
  },
  {
    resource: '/shows/{showId}',
    method: 'PUT',
    handler: updateShowHandler,
  },
  {
    resource: '/shows/{showId}',
    method: 'DELETE',
    handler: deleteShowHandler,
  },
];
export const handler = createRouter(routes);
