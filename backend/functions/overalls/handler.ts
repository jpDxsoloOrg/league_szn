import { handler as submitOverallHandler } from './submitOverall';
import { handler as getMyOverallHandler } from './getMyOverall';
import { handler as getOverallsHandler } from './getOveralls';
import { createRouter, type RouteConfig } from '../../lib/router';

const routes: ReadonlyArray<RouteConfig> = [
  { resource: '/players/me/overall', method: 'GET', handler: getMyOverallHandler },
  { resource: '/players/me/overall', method: 'PUT', handler: submitOverallHandler },
  { resource: '/admin/overalls', method: 'GET', handler: getOverallsHandler },
];
export const handler = createRouter(routes);
