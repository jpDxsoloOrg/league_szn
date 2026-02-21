import { handler as getSiteConfigHandler } from './getSiteConfig';
import { handler as updateSiteConfigHandler } from './updateSiteConfig';
import { handler as clearAllHandler } from './clearAll';
import { handler as seedDataHandler } from './seedData';
import { createRouter, type RouteConfig } from '../../lib/router';

/**
 * Single Lambda for admin: routes by HTTP method and resource.
 * Replaces getSiteConfig, updateSiteConfig, clearAll, seedData.
 * Timeout 29s for clearAll and seedData (set in serverless.yml).
 */
const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/site-config',
    method: 'GET',
    handler: getSiteConfigHandler,
  },
  {
    resource: '/admin/site-config',
    method: 'PUT',
    handler: updateSiteConfigHandler,
  },
  {
    resource: '/admin/clear-all',
    method: 'DELETE',
    handler: clearAllHandler,
  },
  {
    resource: '/admin/seed-data',
    method: 'POST',
    handler: seedDataHandler,
  },
];

export const handler = createRouter(routes);
