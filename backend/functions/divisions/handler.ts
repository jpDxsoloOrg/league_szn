import { APIGatewayProxyEvent, APIGatewayProxyHandler, Context } from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getDivisionsHandler } from './getDivisions';
import { handler as createDivisionHandler } from './createDivision';
import { handler as updateDivisionHandler } from './updateDivision';
import { handler as deleteDivisionHandler } from './deleteDivision';

/**
 * Single Lambda for divisions: routes by HTTP method and path params.
 * Replaces getDivisions, createDivision, updateDivision, deleteDivision.
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context
) => {
  const method = event.httpMethod?.toUpperCase() ?? event.requestContext?.http?.method?.toUpperCase();
  const pathParams = event.pathParameters ?? {};

  if (method === 'GET' && !pathParams.divisionId) {
    return getDivisionsHandler(event, context);
  }
  if (method === 'POST' && !pathParams.divisionId) {
    return createDivisionHandler(event, context);
  }
  if (method === 'PUT' && pathParams.divisionId) {
    return updateDivisionHandler(event, context);
  }
  if (method === 'DELETE' && pathParams.divisionId) {
    return deleteDivisionHandler(event, context);
  }

  return methodNotAllowed();
};
