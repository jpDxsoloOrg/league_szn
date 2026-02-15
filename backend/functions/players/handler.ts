import { APIGatewayProxyEvent, APIGatewayProxyHandler, Context } from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getPlayersHandler } from './getPlayers';
import { handler as createPlayerHandler } from './createPlayer';
import { handler as updatePlayerHandler } from './updatePlayer';
import { handler as deletePlayerHandler } from './deletePlayer';
import { handler as getMyProfileHandler } from './getMyProfile';
import { handler as updateMyProfileHandler } from './updateMyProfile';

/**
 * Single Lambda for players: routes by HTTP method and path.
 * Replaces getPlayers, createPlayer, updatePlayer, deletePlayer, getMyProfile, updateMyProfile.
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context
) => {
  const method = event.httpMethod?.toUpperCase() ?? event.requestContext?.http?.method?.toUpperCase();
  const path = event.path ?? '';
  const pathParams = event.pathParameters ?? {};

  const isMe = path.includes('/me');
  const playerId = pathParams.playerId;

  if (method === 'GET' && isMe) {
    return getMyProfileHandler(event, context);
  }
  if (method === 'PUT' && isMe) {
    return updateMyProfileHandler(event, context);
  }
  if (method === 'GET' && !playerId) {
    return getPlayersHandler(event, context);
  }
  if (method === 'POST' && !playerId) {
    return createPlayerHandler(event, context);
  }
  if (method === 'PUT' && playerId) {
    return updatePlayerHandler(event, context);
  }
  if (method === 'DELETE' && playerId) {
    return deletePlayerHandler(event, context);
  }

  return methodNotAllowed();
};
