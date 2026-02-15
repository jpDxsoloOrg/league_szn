import { APIGatewayProxyEvent, APIGatewayProxyHandler, Context } from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getChampionshipsHandler } from './getChampionships';
import { handler as createChampionshipHandler } from './createChampionship';
import { handler as getChampionshipHistoryHandler } from './getChampionshipHistory';
import { handler as updateChampionshipHandler } from './updateChampionship';
import { handler as deleteChampionshipHandler } from './deleteChampionship';
import { handler as vacateChampionshipHandler } from './vacateChampionship';

/**
 * Single Lambda for championships: routes by HTTP method and path.
 * Replaces getChampionships, createChampionship, getChampionshipHistory, updateChampionship, deleteChampionship, vacateChampionship.
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context
) => {
  const method = event.httpMethod?.toUpperCase() ?? event.requestContext?.http?.method?.toUpperCase();
  const path = event.path ?? '';
  const pathParams = event.pathParameters ?? {};
  const championshipId = pathParams.championshipId;

  const isHistory = path.includes('/history');
  const isVacate = path.includes('/vacate');

  if (method === 'GET' && !championshipId) {
    return getChampionshipsHandler(event, context);
  }
  if (method === 'POST' && !championshipId) {
    return createChampionshipHandler(event, context);
  }
  if (method === 'GET' && championshipId && isHistory) {
    return getChampionshipHistoryHandler(event, context);
  }
  if (method === 'POST' && championshipId && isVacate) {
    return vacateChampionshipHandler(event, context);
  }
  if (method === 'PUT' && championshipId) {
    return updateChampionshipHandler(event, context);
  }
  if (method === 'DELETE' && championshipId) {
    return deleteChampionshipHandler(event, context);
  }

  return methodNotAllowed();
};
