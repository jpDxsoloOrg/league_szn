import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getPromosHandler } from './getPromos';
import { handler as getPromoHandler } from './getPromo';
import { handler as createPromoHandler } from './createPromo';
import { handler as reactToPromoHandler } from './reactToPromo';
import { handler as adminUpdatePromoHandler } from './adminUpdatePromo';
import { handler as deletePromoHandler } from './deletePromo';
import { handler as bulkDeletePromosHandler } from './bulkDeletePromos';

const noopCallback = () => {};

/**
 * Single Lambda for promos: routes by HTTP method and path.
 * Replaces getPromos, getPromo, create, react, adminUpdate, delete, bulkDelete.
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Parameters<APIGatewayProxyHandler>[2]
): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod?.toUpperCase() ?? 'GET';
  const path = event.path ?? '';
  const pathParams = event.pathParameters ?? {};

  if (path.includes('admin/promos/bulk-delete') && method === 'POST') {
    return (await bulkDeletePromosHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (path.includes('admin/promos/') && pathParams.promoId) {
    if (method === 'PUT') {
      return (await adminUpdatePromoHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
    }
    if (method === 'DELETE') {
      return (await deletePromoHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
    }
  }
  if (path.includes('/react') && method === 'POST' && pathParams.promoId) {
    return (await reactToPromoHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'GET' && !pathParams.promoId) {
    return (await getPromosHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'GET' && pathParams.promoId) {
    return (await getPromoHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'POST' && !pathParams.promoId) {
    return (await createPromoHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }

  return methodNotAllowed();
};
