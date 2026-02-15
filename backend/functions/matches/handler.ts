import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getMatchesHandler } from './getMatches';
import { handler as scheduleMatchHandler } from './scheduleMatch';
import { handler as recordResultHandler } from './recordResult';

const noopCallback = () => {};

/**
 * Single Lambda for matches: routes by HTTP method and path params.
 * Replaces getMatches, scheduleMatch, recordResult.
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Parameters<APIGatewayProxyHandler>[2]
): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod?.toUpperCase() ?? 'GET';
  const pathParams = event.pathParameters ?? {};

  if (method === 'GET' && !pathParams.matchId) {
    return (await getMatchesHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'POST' && !pathParams.matchId) {
    return (await scheduleMatchHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'PUT' && pathParams.matchId) {
    return (await recordResultHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }

  return methodNotAllowed();
};
