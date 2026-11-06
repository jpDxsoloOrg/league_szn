import { handler as getDivisionsHandler } from './getDivisions';
import { handler as createDivisionHandler } from './createDivision';
import { handler as updateDivisionHandler } from './updateDivision';
import { handler as deleteDivisionHandler } from './deleteDivision';
import { createRouter, type RouteConfig, STAFF } from '../../lib/router';

export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/divisions',
    method: 'GET',
    handler: getDivisionsHandler,
    access: 'public',
  },
  {
    resource: '/divisions',
    method: 'POST',
    handler: createDivisionHandler,
    access: STAFF,
  },
  {
    resource: '/divisions/{divisionId}',
    method: 'PUT',
    handler: updateDivisionHandler,
    access: STAFF,
  },
  {
    resource: '/divisions/{divisionId}',
    method: 'DELETE',
    handler: deleteDivisionHandler,
    access: STAFF,
  },
];

export const handler = createRouter(routes);