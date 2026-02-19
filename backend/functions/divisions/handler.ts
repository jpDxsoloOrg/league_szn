import { handler as getDivisionsHandler } from './getDivisions';
import { handler as createDivisionHandler } from './createDivision';
import { handler as updateDivisionHandler } from './updateDivision';
import { handler as deleteDivisionHandler } from './deleteDivision';
import { createRouter, RouteConfig } from '../../lib/router';

const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/divisions',
    method: 'GET',
    handler: getDivisionsHandler,
  },
  {
    resource: '/divisions',
    method: 'POST',
    handler: createDivisionHandler,
  },
  {
    resource: '/divisions/{divisionId}',
    method: 'PUT',
    handler: updateDivisionHandler,
  },
  {
    resource: '/divisions/{divisionId}',
    method: 'DELETE',
    handler: deleteDivisionHandler,
  },
];

export const handler = createRouter(routes);