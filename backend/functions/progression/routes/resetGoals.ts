import { STAFF, type RouteConfig } from '../../../lib/router';
import { handler as resetGoals } from '../resetGoals';

/**
 * Routes owned by PRL-05 (#233): POST /progression/players/{playerId}/reset-goals
 */
export const resetGoalsRoutes: ReadonlyArray<RouteConfig> = [
  { resource: '/progression/players/{playerId}/reset-goals', method: 'POST', handler: resetGoals, access: STAFF },
];
