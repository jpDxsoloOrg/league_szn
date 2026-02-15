import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getChallengesHandler } from './getChallenges';
import { handler as getChallengeHandler } from './getChallenge';
import { handler as createChallengeHandler } from './createChallenge';
import { handler as respondToChallengeHandler } from './respondToChallenge';
import { handler as cancelChallengeHandler } from './cancelChallenge';
import { handler as deleteChallengeHandler } from './deleteChallenge';
import { handler as bulkDeleteChallengesHandler } from './bulkDeleteChallenges';

const noopCallback = () => {};

/**
 * Single Lambda for challenges: routes by HTTP method and path.
 * Replaces getChallenges, getChallenge, create, respond, cancel, delete, bulkDelete.
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Parameters<APIGatewayProxyHandler>[2]
): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod?.toUpperCase() ?? 'GET';
  const path = event.path ?? '';
  const pathParams = event.pathParameters ?? {};

  if (path.includes('bulk-delete') && method === 'POST') {
    return (await bulkDeleteChallengesHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (path.includes('/respond') && method === 'POST' && pathParams.challengeId) {
    return (await respondToChallengeHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (path.includes('/cancel') && method === 'POST' && pathParams.challengeId) {
    return (await cancelChallengeHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'GET' && !pathParams.challengeId) {
    return (await getChallengesHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'GET' && pathParams.challengeId) {
    return (await getChallengeHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'POST' && !pathParams.challengeId) {
    return (await createChallengeHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'DELETE' && pathParams.challengeId) {
    return (await deleteChallengeHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }

  return methodNotAllowed();
};
