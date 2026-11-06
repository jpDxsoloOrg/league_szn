import { handler as submitOverallHandler } from './submitOverall';
import { handler as getMyOverallHandler } from './getMyOverall';
import { handler as getOverallsHandler } from './getOveralls';
import { createRouter, type RouteConfig, STAFF } from '../../lib/router';

export const routes: ReadonlyArray<RouteConfig> = [
  { resource: '/players/me/overall', method: 'GET', handler: getMyOverallHandler, access: 'self-service' },
  { resource: '/players/me/overall', method: 'PUT', handler: submitOverallHandler, access: 'self-service' },
  { resource: '/admin/overalls', method: 'GET', handler: getOverallsHandler, access: STAFF },
];
export const handler = createRouter(routes);
