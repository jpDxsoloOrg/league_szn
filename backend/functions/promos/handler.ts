import { APIGatewayProxyEvent, APIGatewayProxyHandler, Context } from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getPromosHandler } from './getPromos';
import { handler as getPromoHandler } from './getPromo';
import { handler as createPromoHandler } from './createPromo';
import { handler as reactToPromoHandler } from './reactToPromo';
import { handler as adminUpdatePromoHandler } from './adminUpdatePromo';
import { handler as deletePromoHandler } from './deletePromo';
import { handler as bulkDeletePromosHandler } from './bulkDeletePromos';

/**
 * Single Lambda for promos: routes by HTTP method and path.
 * Replaces getPromos, getPromo, createPromo, reactToPromo, adminUpdatePromo, deletePromo, bulkDeletePromos.
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context
) => {
  const method = event.httpMethod?.toUpperCase() ?? event.requestContext?.http?.method?.toUpperCase();
  const path = event.path ?? '';
  const pathParams = event.pathParameters ?? {};
  const promoId = pathParams.promoId;

  const isAdminPromos = path.includes('admin/promos');
  const isReact = path.includes('/react');
  const isBulkDelete = path.includes('bulk-delete');

  if (method === 'POST' && isAdminPromos && isBulkDelete) {
    return bulkDeletePromosHandler(event, context);
  }
  if (method === 'GET' && !promoId && !isAdminPromos) {
    return getPromosHandler(event, context);
  }
  if (method === 'GET' && promoId && !isAdminPromos) {
    return getPromoHandler(event, context);
  }
  if (method === 'POST' && !promoId) {
    return createPromoHandler(event, context);
  }
  if (method === 'POST' && promoId && isReact) {
    return reactToPromoHandler(event, context);
  }
  if (method === 'PUT' && isAdminPromos && promoId) {
    return adminUpdatePromoHandler(event, context);
  }
  if (method === 'DELETE' && isAdminPromos && promoId) {
    return deletePromoHandler(event, context);
  }

  return methodNotAllowed();
};
