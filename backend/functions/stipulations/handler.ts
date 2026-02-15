import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Context } from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getStipulationsHandler } from './getStipulations';
import { handler as createStipulationHandler } from './createStipulation';
import { handler as updateStipulationHandler } from './updateStipulation';
import { handler as deleteStipulationHandler } from './deleteStipulation';

const noopCallback = () => {};

/**
 * Single Lambda for stipulations: routes by HTTP method and path params.
 * Replaces getStipulations, createStipulation, updateStipulation, deleteStipulation.
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Parameters<APIGatewayProxyHandler>[2]
): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod?.toUpperCase() ?? 'GET';
  const pathParams = event.pathParameters ?? {};

  if (method === 'GET' && !pathParams.stipulationId) {
    return (await getStipulationsHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'POST' && !pathParams.stipulationId) {
    return (await createStipulationHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'PUT' && pathParams.stipulationId) {
    return (await updateStipulationHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'DELETE' && pathParams.stipulationId) {
    return (await deleteStipulationHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }

  return methodNotAllowed();
};
