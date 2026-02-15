import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Context } from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getSeasonsHandler } from './getSeasons';
import { handler as createSeasonHandler } from './createSeason';
import { handler as updateSeasonHandler } from './updateSeason';
import { handler as deleteSeasonHandler } from './deleteSeason';

const noopCallback = () => {};

/**
 * Single Lambda for seasons: routes by HTTP method and path params.
 * Replaces getSeasons, createSeason, updateSeason, deleteSeason.
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Parameters<APIGatewayProxyHandler>[2]
): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod?.toUpperCase() ?? 'GET';
  const pathParams = event.pathParameters ?? {};

  if (method === 'GET' && !pathParams.seasonId) {
    return (await getSeasonsHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'POST' && !pathParams.seasonId) {
    return (await createSeasonHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'PUT' && pathParams.seasonId) {
    return (await updateSeasonHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'DELETE' && pathParams.seasonId) {
    return (await deleteSeasonHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }

  return methodNotAllowed();
};
