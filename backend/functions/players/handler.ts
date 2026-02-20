import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getPlayersHandler } from './getPlayers';
import { handler as createPlayerHandler } from './createPlayer';
import { handler as updatePlayerHandler } from './updatePlayer';
import { handler as deletePlayerHandler } from './deletePlayer';
import { handler as getMyProfileHandler } from './getMyProfile';
import { handler as updateMyProfileHandler } from './updateMyProfile';
import { handler as getPlayerStatisticsHandler } from './getPlayerStatistics';

const noopCallback = () => {};

/**
 * Single Lambda for players: routes by HTTP method and path.
 * Replaces getPlayers, createPlayer, updatePlayer, deletePlayer, getMyProfile, updateMyProfile.
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Parameters<APIGatewayProxyHandler>[2]
): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod?.toUpperCase() ?? 'GET';
  const path = event.path ?? '';
  const pathParams = event.pathParameters ?? {};

  if (path.includes('/me')) {
    if (method === 'GET') {
      return (await getMyProfileHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
    }
    if (method === 'PUT') {
      return (await updateMyProfileHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
    }
  }
  if (method === 'GET' && pathParams.playerId && path.includes('/statistics')) {
    return (await getPlayerStatisticsHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'GET' && !pathParams.playerId) {
    return (await getPlayersHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'POST' && !pathParams.playerId) {
    return (await createPlayerHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'PUT' && pathParams.playerId) {
    return (await updatePlayerHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'DELETE' && pathParams.playerId) {
    return (await deletePlayerHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }

  return methodNotAllowed();
};
