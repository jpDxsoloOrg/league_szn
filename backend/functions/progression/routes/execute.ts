import { STAFF, type RouteConfig } from '../../../lib/router';
import { handler as executeProgression } from '../executeProgression';

/**
 * Routes owned by CUP-06 (#184): POST /progression/players/{playerId}/execute
 */
export const executeRoutes: ReadonlyArray<RouteConfig> = [
  { resource: '/progression/players/{playerId}/execute', method: 'POST', handler: executeProgression, access: STAFF },
];
