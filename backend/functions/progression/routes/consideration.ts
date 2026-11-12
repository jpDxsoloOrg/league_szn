import { STAFF, type RouteConfig } from '../../../lib/router';
import { handler as setConsideration } from '../setConsideration';
import { handler as listConsiderations } from '../listConsiderations';

/**
 * Routes owned by CUP-05 (#183): PUT /progression/players/{playerId}/consideration, GET /progression/considerations
 */
export const considerationRoutes: ReadonlyArray<RouteConfig> = [
  { resource: '/progression/players/{playerId}/consideration', method: 'PUT', handler: setConsideration, access: STAFF },
  { resource: '/progression/considerations', method: 'GET', handler: listConsiderations, access: 'public' },
];
