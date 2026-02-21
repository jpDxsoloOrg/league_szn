import { handler as getPromosHandler } from './getPromos';
import { handler as getPromoHandler } from './getPromo';
import { handler as createPromoHandler } from './createPromo';
import { handler as reactToPromoHandler } from './reactToPromo';
import { handler as adminUpdatePromoHandler } from './adminUpdatePromo';
import { handler as deletePromoHandler } from './deletePromo';
import { handler as bulkDeletePromosHandler } from './bulkDeletePromos';
import { createRouter, type RouteConfig } from '../../lib/router';

/**
 * Single Lambda for promos: routes by HTTP method and resource.
 * Replaces getPromos, getPromo, create, react, adminUpdate, delete, bulkDelete.
 */
const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/promos',
    method: 'GET',
    handler: getPromosHandler,
  },
  {
    resource: '/promos/{promoId}',
    method: 'GET',
    handler: getPromoHandler,
  },
  {
    resource: '/promos',
    method: 'POST',
    handler: createPromoHandler,
  },
  {
    resource: '/promos/{promoId}/react',
    method: 'POST',
    handler: reactToPromoHandler,
  },
  {
    resource: '/admin/promos/{promoId}',
    method: 'PUT',
    handler: adminUpdatePromoHandler,
  },
  {
    resource: '/admin/promos/{promoId}',
    method: 'DELETE',
    handler: deletePromoHandler,
  },
  {
    resource: '/admin/promos/bulk-delete',
    method: 'POST',
    handler: bulkDeletePromosHandler,
  },
];

export const handler = createRouter(routes);
