import { STAFF, type RouteConfig } from '../../../lib/router';
import { notImplemented } from './notImplemented';

/**
 * Routes owned by CUP-05 (#183): PUT /progression/players/{playerId}/consideration, GET /progression/considerations
 */
export const considerationRoutes: ReadonlyArray<RouteConfig> = [
  { resource: '/progression/players/{playerId}/consideration', method: 'PUT', handler: notImplemented, access: STAFF },
  { resource: '/progression/considerations', method: 'GET', handler: notImplemented, access: 'public' },
];
