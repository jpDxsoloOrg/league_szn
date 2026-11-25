import { handler as getSiteConfigHandler } from './getSiteConfig';
import { handler as updateSiteConfigHandler } from './updateSiteConfig';
import { handler as clearAllHandler } from './clearAll';
import { handler as seedDataHandler } from './seedData';
import { handler as exportDataHandler } from './exportData';
import { handler as getHeatConfigHandler } from './getHeatConfig';
import { handler as updateHeatConfigHandler } from './updateHeatConfig';
import { handler as getEconomyConfigHandler } from './getEconomyConfig';
import { handler as updateEconomyConfigHandler } from './updateEconomyConfig';
import { handler as getEconomyCatalogHandler } from './getEconomyCatalog';
import { handler as shopPurchaseHandler } from '../shop/purchase'; // ECO-08
import { createRouter, type RouteConfig, ADMIN_ONLY, STAFF } from '../../lib/router';

/**
 * Single Lambda for admin: routes by HTTP method and resource.
 * Replaces getSiteConfig, updateSiteConfig, clearAll, seedData.
 * Timeout 29s for clearAll and seedData (set in serverless.yml).
 */
export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/site-config',
    method: 'GET',
    handler: getSiteConfigHandler,
    access: 'public',
  },
  {
    resource: '/admin/site-config',
    method: 'PUT',
    handler: updateSiteConfigHandler,
    access: ADMIN_ONLY,
  },
  {
    resource: '/admin/clear-all',
    method: 'DELETE',
    handler: clearAllHandler,
    access: ADMIN_ONLY,
  },
  {
    resource: '/admin/seed-data',
    method: 'POST',
    handler: seedDataHandler,
    access: ADMIN_ONLY,
  },
  {
    resource: '/admin/export-data',
    method: 'GET',
    handler: exportDataHandler,
    access: ADMIN_ONLY,
  },
  {
    resource: '/admin/heat-config',
    method: 'GET',
    handler: getHeatConfigHandler,
    access: ADMIN_ONLY,
  },
  {
    resource: '/admin/heat-config',
    method: 'PUT',
    handler: updateHeatConfigHandler,
    access: ADMIN_ONLY,
  },
  {
    resource: '/admin/economy-config',
    method: 'GET',
    handler: getEconomyConfigHandler,
    access: STAFF,
  },
  {
    resource: '/admin/economy-config',
    method: 'PUT',
    handler: updateEconomyConfigHandler,
    access: ADMIN_ONLY,
  },
  {
    resource: '/economy/catalog',
    method: 'GET',
    handler: getEconomyCatalogHandler,
    access: 'public',
  },

  // ECO-08: the player buys for themselves; the handler checks the Wrestler role.
  {
    resource: '/shop/purchase',
    method: 'POST',
    handler: shopPurchaseHandler,
    access: 'self-service',
  },
];

export const handler = createRouter(routes);
