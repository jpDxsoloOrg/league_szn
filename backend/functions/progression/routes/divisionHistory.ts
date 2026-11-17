import type { RouteConfig } from '../../../lib/router';
import { getDivisionHistory } from '../history';

/**
 * Routes owned by DMV-09 (#199): GET /progression/players/{playerId}/history
 */
export const divisionHistoryRoutes: ReadonlyArray<RouteConfig> = [
  { resource: '/progression/players/{playerId}/history', method: 'GET', handler: getDivisionHistory, access: 'public' },
];
