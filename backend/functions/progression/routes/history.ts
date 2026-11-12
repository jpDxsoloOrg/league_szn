import { STAFF, type RouteConfig } from '../../../lib/router';
import { listProgressionEvents } from '../listProgressionEvents';

/**
 * Routes owned by CUP-09 (#187): GET /progression/events (the call-up history).
 */
export const historyRoutes: ReadonlyArray<RouteConfig> = [
  { resource: '/progression/events', method: 'GET', handler: listProgressionEvents, access: STAFF },
];
