import { handler as getDashboardHandler } from './getDashboard';
import { handler as getTickerHandler } from './getTicker';
import { createRouter, type RouteConfig } from '../../lib/router';

/**
 * Single Lambda for the league overview: the dashboard and the ticker feed.
 * The ticker rides here so it adds no new function to the stack.
 */
export const routes: ReadonlyArray<RouteConfig> = [
  { resource: '/dashboard', method: 'GET', handler: getDashboardHandler, access: 'public' },
  { resource: '/ticker', method: 'GET', handler: getTickerHandler, access: 'public' },
];

export const handler = createRouter(routes);
