import { handler as getMatchesHandler } from './getMatches';
import { handler as scheduleMatchHandler } from './scheduleMatch';
import { handler as recordResultHandler } from './recordResult';
import { createRouter, type RouteConfig } from '../../lib/router';

/**
 * Single Lambda for matches: routes by HTTP method and resource.
 * Replaces getMatches, scheduleMatch, recordResult.
 */
const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/matches',
    method: 'GET',
    handler: getMatchesHandler,
  },
  {
    resource: '/matches',
    method: 'POST',
    handler: scheduleMatchHandler,
  },
  {
    resource: '/matches/{matchId}/result',
    method: 'PUT',
    handler: recordResultHandler,
  },
];

export const handler = createRouter(routes);
