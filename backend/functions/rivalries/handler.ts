import { handler as createRivalryHandler } from './createRivalry';
import { handler as getRivalriesHandler } from './getRivalries';
import { handler as getRivalryHandler } from './getRivalry';
import { handler as updateRivalryHandler } from './updateRivalry';
import { handler as respondRivalryHandler } from './respondRivalry';
import { handler as deleteRivalryHandler } from './deleteRivalry';
import { handler as recomputeHeatHandler } from './recomputeHeat';
import { createRouter, type RouteConfig, STAFF } from '../../lib/router';

/**
 * Single Lambda for persistent rivalries. RIV-02.
 *
 * Public reads (`GET /rivalry-requests`, `GET /rivalry-requests/{id}`) skip
 * the JWT check; the detail handler still authenticates opportunistically
 * to apply role-based filtering when an Authorization header is present.
 *
 * The synthetic match-history endpoint at `GET /rivalries` lives in its own
 * Lambda (`getMatchHistoryRivalries`) and is unaffected by this dispatcher.
 */
export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/rivalry-requests',
    method: 'GET',
    handler: getRivalriesHandler,
    access: 'public',
  },
  {
    resource: '/rivalry-requests/{rivalryId}',
    method: 'GET',
    handler: getRivalryHandler,
    access: 'public',
  },
  {
    resource: '/rivalry-requests',
    method: 'POST',
    handler: createRivalryHandler,
    access: STAFF,
  },
  {
    resource: '/rivalry-requests/{rivalryId}',
    method: 'PUT',
    handler: updateRivalryHandler,
    access: 'self-service',
  },
  {
    resource: '/rivalry-requests/{rivalryId}/respond',
    method: 'POST',
    handler: respondRivalryHandler,
    access: STAFF,
  },
  {
    resource: '/rivalry-requests/{rivalryId}',
    method: 'DELETE',
    handler: deleteRivalryHandler,
    access: STAFF,
  },
  {
    resource: '/rivalry-requests/{rivalryId}/recompute-heat',
    method: 'POST',
    handler: recomputeHeatHandler,
    access: STAFF,
  },
];

export const handler = createRouter(routes);
