import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getSiteConfigHandler } from './getSiteConfig';
import { handler as updateSiteConfigHandler } from './updateSiteConfig';
import { handler as clearAllHandler } from './clearAll';
import { handler as seedDataHandler } from './seedData';

const noopCallback = () => {};

/**
 * Single Lambda for admin: routes by HTTP method and path.
 * Replaces getSiteConfig, updateSiteConfig, clearAll, seedData.
 * Timeout 29s for clearAll and seedData (set in serverless.yml).
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Parameters<APIGatewayProxyHandler>[2]
): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod?.toUpperCase() ?? 'GET';
  const path = event.path ?? '';

  if (path.includes('seed-data') && method === 'POST') {
    return (await seedDataHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (path.includes('clear-all') && method === 'DELETE') {
    return (await clearAllHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (path.includes('site-config')) {
    if (method === 'GET') {
      return (await getSiteConfigHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
    }
    if (method === 'PUT') {
      return (await updateSiteConfigHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
    }
  }

  return methodNotAllowed();
};
