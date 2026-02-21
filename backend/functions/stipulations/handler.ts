import { createRouter, type RouteConfig } from '../../lib/router';
import { handler as getStipulationsHandler } from './getStipulations';
import { handler as createStipulationHandler } from './createStipulation';
import { handler as updateStipulationHandler } from './updateStipulation';
import { handler as deleteStipulationHandler } from './deleteStipulation';

/**
 * Single Lambda for stipulations: routes by method + resource.
 */
const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/stipulations',
    method: 'GET',
    handler: getStipulationsHandler,
  },
  {
    resource: '/stipulations',
    method: 'POST',
    handler: createStipulationHandler,
  },
  {
    resource: '/stipulations/{stipulationId}',
    method: 'PUT',
    handler: updateStipulationHandler,
  },
  {
    resource: '/stipulations/{stipulationId}',
    method: 'DELETE',
    handler: deleteStipulationHandler,
  },
];

export const handler = createRouter(routes);
