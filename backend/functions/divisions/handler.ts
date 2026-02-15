import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Context } from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getDivisionsHandler } from './getDivisions';
import { handler as createDivisionHandler } from './createDivision';
import { handler as updateDivisionHandler } from './updateDivision';
import { handler as deleteDivisionHandler } from './deleteDivision';

const noopCallback = () => {};

/**
 * Single Lambda for divisions: routes by HTTP method and path params.
 * Replaces getDivisions, createDivision, updateDivision, deleteDivision.
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Parameters<APIGatewayProxyHandler>[2]
): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod?.toUpperCase() ?? 'GET';
  const pathParams = event.pathParameters ?? {};

  if (method === 'GET' && !pathParams.divisionId) {
    return (await getDivisionsHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'POST' && !pathParams.divisionId) {
    return (await createDivisionHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'PUT' && pathParams.divisionId) {
    return (await updateDivisionHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'DELETE' && pathParams.divisionId) {
    return (await deleteDivisionHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }

  return methodNotAllowed();
};
