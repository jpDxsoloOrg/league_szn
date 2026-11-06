import { handler as getPromosHandler } from './getPromos';
import { handler as getPromoHandler } from './getPromo';
import { handler as createPromoHandler } from './createPromo';
import { handler as reactToPromoHandler } from './reactToPromo';
import { handler as adminUpdatePromoHandler } from './adminUpdatePromo';
import { handler as deletePromoHandler } from './deletePromo';
import { handler as bulkDeletePromosHandler } from './bulkDeletePromos';
import { createRouter, type RouteConfig, STAFF } from '../../lib/router';

/**
 * Single Lambda for promos: routes by HTTP method and resource.
 * Replaces getPromos, getPromo, create, react, adminUpdate, delete, bulkDelete.
 */
export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/promos',
    method: 'GET',
    handler: getPromosHandler,
    access: 'public',
  },
  {
    resource: '/promos/{promoId}',
    method: 'GET',
    handler: getPromoHandler,
    access: 'public',
  },
  {
    resource: '/promos',
    method: 'POST',
    handler: createPromoHandler,
    access: 'self-service',
  },
  {
    resource: '/promos/{promoId}/react',
    method: 'POST',
    handler: reactToPromoHandler,
    access: 'self-service',
  },
  {
    resource: '/admin/promos/{promoId}',
    method: 'PUT',
    handler: adminUpdatePromoHandler,
    access: STAFF,
  },
  {
    resource: '/admin/promos/{promoId}',
    method: 'DELETE',
    handler: deletePromoHandler,
    access: STAFF,
  },
  {
    resource: '/admin/promos/bulk-delete',
    method: 'POST',
    handler: bulkDeletePromosHandler,
    access: STAFF,
  },
];

export const handler = createRouter(routes);
