import { APIGatewayProxyEvent, APIGatewayProxyHandler, Context } from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getStipulationsHandler } from './getStipulations';
import { handler as createStipulationHandler } from './createStipulation';
import { handler as updateStipulationHandler } from './updateStipulation';
import { handler as deleteStipulationHandler } from './deleteStipulation';

/**
 * Single Lambda for stipulations: routes by HTTP method and path params.
 * Replaces getStipulations, createStipulation, updateStipulation, deleteStipulation.
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context
) => {
  const method = event.httpMethod?.toUpperCase() ?? event.requestContext?.http?.method?.toUpperCase();
  const pathParams = event.pathParameters ?? {};

  if (method === 'GET' && !pathParams.stipulationId) {
    return getStipulationsHandler(event, context);
  }
  if (method === 'POST' && !pathParams.stipulationId) {
    return createStipulationHandler(event, context);
  }
  if (method === 'PUT' && pathParams.stipulationId) {
    return updateStipulationHandler(event, context);
  }
  if (method === 'DELETE' && pathParams.stipulationId) {
    return deleteStipulationHandler(event, context);
  }

  return methodNotAllowed();
};
