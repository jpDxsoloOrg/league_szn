import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getContendersHandler } from './getContenders';
import { handler as calculateRankingsHandler } from './calculateRankings';

const noopCallback = () => {};

/**
 * Single Lambda for contenders: routes by HTTP method and path.
 * Replaces getContenders, calculateRankings.
 * Timeout 29s for calculateRankings (set in serverless.yml).
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Parameters<APIGatewayProxyHandler>[2]
): Promise<APIGatewayProxyResult> => {
  // Direct Lambda invocation (e.g. from recordResult) — no requestContext
  const isApiGateway = event.requestContext != null;
  if (!isApiGateway && (event as { source?: string }).source === 'recordResult') {
    return (await calculateRankingsHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }

  const method = event.httpMethod?.toUpperCase() ?? 'GET';
  const path = event.path ?? '';
  const pathParams = event.pathParameters ?? {};

  if (path.includes('recalculate') && method === 'POST') {
    return (await calculateRankingsHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'GET' && pathParams.championshipId) {
    return (await getContendersHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }

  return methodNotAllowed();
};
