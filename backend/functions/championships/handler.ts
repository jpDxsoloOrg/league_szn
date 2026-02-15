import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getChampionshipsHandler } from './getChampionships';
import { handler as createChampionshipHandler } from './createChampionship';
import { handler as getChampionshipHistoryHandler } from './getChampionshipHistory';
import { handler as updateChampionshipHandler } from './updateChampionship';
import { handler as deleteChampionshipHandler } from './deleteChampionship';
import { handler as vacateChampionshipHandler } from './vacateChampionship';

const noopCallback = () => {};

/**
 * Single Lambda for championships: routes by HTTP method and path.
 * Replaces getChampionships, createChampionship, getChampionshipHistory, updateChampionship, deleteChampionship, vacateChampionship.
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Parameters<APIGatewayProxyHandler>[2]
): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod?.toUpperCase() ?? 'GET';
  const path = event.path ?? '';
  const pathParams = event.pathParameters ?? {};

  if (path.includes('/vacate') && method === 'POST' && pathParams.championshipId) {
    return (await vacateChampionshipHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (path.includes('/history') && method === 'GET' && pathParams.championshipId) {
    return (await getChampionshipHistoryHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'GET' && !pathParams.championshipId) {
    return (await getChampionshipsHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'POST' && !pathParams.championshipId) {
    return (await createChampionshipHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'PUT' && pathParams.championshipId) {
    return (await updateChampionshipHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'DELETE' && pathParams.championshipId) {
    return (await deleteChampionshipHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }

  return methodNotAllowed();
};
