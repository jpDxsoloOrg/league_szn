import { createRouter, type RouteConfig, STAFF } from '../../lib/router';
import { handler as getStipulationsHandler } from './getStipulations';
import { handler as createStipulationHandler } from './createStipulation';
import { handler as updateStipulationHandler } from './updateStipulation';
import { handler as deleteStipulationHandler } from './deleteStipulation';

/**
 * Single Lambda for stipulations: routes by method + resource.
 */
export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/stipulations',
    method: 'GET',
    handler: getStipulationsHandler,
    access: 'public',
  },
  {
    resource: '/stipulations',
    method: 'POST',
    handler: createStipulationHandler,
    access: STAFF,
  },
  {
    resource: '/stipulations/{stipulationId}',
    method: 'PUT',
    handler: updateStipulationHandler,
    access: STAFF,
  },
  {
    resource: '/stipulations/{stipulationId}',
    method: 'DELETE',
    handler: deleteStipulationHandler,
    access: STAFF,
  },
];

export const handler = createRouter(routes);
