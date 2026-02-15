import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getTournamentsHandler } from './getTournaments';
import { handler as createTournamentHandler } from './createTournament';
import { handler as updateTournamentHandler } from './updateTournament';

const noopCallback = () => {};

/**
 * Single Lambda for tournaments: routes by HTTP method and path params.
 * Replaces getTournaments, createTournament, updateTournament.
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Parameters<APIGatewayProxyHandler>[2]
): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod?.toUpperCase() ?? 'GET';
  const pathParams = event.pathParameters ?? {};

  if (method === 'GET' && !pathParams.tournamentId) {
    return (await getTournamentsHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'POST' && !pathParams.tournamentId) {
    return (await createTournamentHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'PUT' && pathParams.tournamentId) {
    return (await updateTournamentHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }

  return methodNotAllowed();
};
