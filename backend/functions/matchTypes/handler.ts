import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Context } from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getMatchTypesHandler } from './getMatchTypes';
import { handler as createMatchTypeHandler } from './createMatchType';
import { handler as updateMatchTypeHandler } from './updateMatchType';
import { handler as deleteMatchTypeHandler } from './deleteMatchType';

const noopCallback = () => {};

/**
 * Single Lambda for match types: routes by HTTP method and path params.
 * Replaces getMatchTypes, createMatchType, updateMatchType, deleteMatchType.
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Parameters<APIGatewayProxyHandler>[2]
): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod?.toUpperCase() ?? 'GET';
  const pathParams = event.pathParameters ?? {};

  if (method === 'GET' && !pathParams.matchTypeId) {
    return (await getMatchTypesHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'POST' && !pathParams.matchTypeId) {
    return (await createMatchTypeHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'PUT' && pathParams.matchTypeId) {
    return (await updateMatchTypeHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'DELETE' && pathParams.matchTypeId) {
    return (await deleteMatchTypeHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }

  return methodNotAllowed();
};
