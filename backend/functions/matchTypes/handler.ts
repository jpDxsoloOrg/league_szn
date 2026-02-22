import { createRouter, type RouteConfig } from '../../lib/router';
import { handler as getMatchTypesHandler } from './getMatchTypes';
import { handler as createMatchTypeHandler } from './createMatchType';
import { handler as updateMatchTypeHandler } from './updateMatchType';
import { handler as deleteMatchTypeHandler } from './deleteMatchType';

/**
 * Single Lambda for match types: routes by method + resource.
 */
const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/match-types',
    method: 'GET',
    handler: getMatchTypesHandler,
  },
  {
    resource: '/match-types',
    method: 'POST',
    handler: createMatchTypeHandler,
  },
  {
    resource: '/match-types/{matchTypeId}',
    method: 'PUT',
    handler: updateMatchTypeHandler,
  },
  {
    resource: '/match-types/{matchTypeId}',
    method: 'DELETE',
    handler: deleteMatchTypeHandler,
  },
];

export const handler = createRouter(routes);
