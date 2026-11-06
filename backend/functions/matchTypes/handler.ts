import { createRouter, type RouteConfig, STAFF } from '../../lib/router';
import { handler as getMatchTypesHandler } from './getMatchTypes';
import { handler as createMatchTypeHandler } from './createMatchType';
import { handler as updateMatchTypeHandler } from './updateMatchType';
import { handler as deleteMatchTypeHandler } from './deleteMatchType';

/**
 * Single Lambda for match types: routes by method + resource.
 */
export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/match-types',
    method: 'GET',
    handler: getMatchTypesHandler,
    access: 'public',
  },
  {
    resource: '/match-types',
    method: 'POST',
    handler: createMatchTypeHandler,
    access: STAFF,
  },
  {
    resource: '/match-types/{matchTypeId}',
    method: 'PUT',
    handler: updateMatchTypeHandler,
    access: STAFF,
  },
  {
    resource: '/match-types/{matchTypeId}',
    method: 'DELETE',
    handler: deleteMatchTypeHandler,
    access: STAFF,
  },
];

export const handler = createRouter(routes);
