import { APIGatewayProxyEvent, APIGatewayProxyHandler, Context } from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getMatchTypesHandler } from './getMatchTypes';
import { handler as createMatchTypeHandler } from './createMatchType';
import { handler as updateMatchTypeHandler } from './updateMatchType';
import { handler as deleteMatchTypeHandler } from './deleteMatchType';

/**
 * Single Lambda for match types: routes by HTTP method and path params.
 * Replaces getMatchTypes, createMatchType, updateMatchType, deleteMatchType.
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context
) => {
  const method = event.httpMethod?.toUpperCase() ?? event.requestContext?.http?.method?.toUpperCase();
  const pathParams = event.pathParameters ?? {};

  if (method === 'GET' && !pathParams.matchTypeId) {
    return getMatchTypesHandler(event, context);
  }
  if (method === 'POST' && !pathParams.matchTypeId) {
    return createMatchTypeHandler(event, context);
  }
  if (method === 'PUT' && pathParams.matchTypeId) {
    return updateMatchTypeHandler(event, context);
  }
  if (method === 'DELETE' && pathParams.matchTypeId) {
    return deleteMatchTypeHandler(event, context);
  }

  return methodNotAllowed();
};
