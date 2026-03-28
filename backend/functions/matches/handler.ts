import { handler as getMatchesHandler } from './getMatches';
import { handler as scheduleMatchHandler } from './scheduleMatch';
import { handler as recordResultHandler } from './recordResult';
import { handler as updateMatchHandler } from './updateMatch';
import { handler as deleteMatchHandler } from './deleteMatch';
import { createRouter, type RouteConfig } from '../../lib/router';

/**
 * Single Lambda for matches: routes by HTTP method and resource.
 * Replaces getMatches, scheduleMatch, recordResult, updateMatch, deleteMatch.
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
  {
    resource: '/matches/{matchId}',
    method: 'PUT',
    handler: updateMatchHandler,
  },
  {
    resource: '/matches/{matchId}',
    method: 'DELETE',
    handler: deleteMatchHandler,
  },
];

export const handler = createRouter(routes);
