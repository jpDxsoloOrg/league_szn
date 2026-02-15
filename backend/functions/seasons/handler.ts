import { APIGatewayProxyEvent, APIGatewayProxyHandler, Context } from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getSeasonsHandler } from './getSeasons';
import { handler as createSeasonHandler } from './createSeason';
import { handler as updateSeasonHandler } from './updateSeason';
import { handler as deleteSeasonHandler } from './deleteSeason';

/**
 * Single Lambda for seasons: routes by HTTP method and path params.
 * Replaces getSeasons, createSeason, updateSeason, deleteSeason.
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context
) => {
  const method = event.httpMethod?.toUpperCase() ?? event.requestContext?.http?.method?.toUpperCase();
  const pathParams = event.pathParameters ?? {};

  if (method === 'GET' && !pathParams.seasonId) {
    return getSeasonsHandler(event, context);
  }
  if (method === 'POST' && !pathParams.seasonId) {
    return createSeasonHandler(event, context);
  }
  if (method === 'PUT' && pathParams.seasonId) {
    return updateSeasonHandler(event, context);
  }
  if (method === 'DELETE' && pathParams.seasonId) {
    return deleteSeasonHandler(event, context);
  }

  return methodNotAllowed();
};
