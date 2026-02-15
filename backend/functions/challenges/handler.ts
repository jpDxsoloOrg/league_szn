import { APIGatewayProxyEvent, APIGatewayProxyHandler, Context } from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getChallengesHandler } from './getChallenges';
import { handler as getChallengeHandler } from './getChallenge';
import { handler as createChallengeHandler } from './createChallenge';
import { handler as respondToChallengeHandler } from './respondToChallenge';
import { handler as cancelChallengeHandler } from './cancelChallenge';
import { handler as deleteChallengeHandler } from './deleteChallenge';
import { handler as bulkDeleteChallengesHandler } from './bulkDeleteChallenges';

/**
 * Single Lambda for challenges: routes by HTTP method and path.
 * Replaces getChallenges, getChallenge, createChallenge, respondToChallenge, cancelChallenge, deleteChallenge, bulkDeleteChallenges.
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context
) => {
  const method = event.httpMethod?.toUpperCase() ?? event.requestContext?.http?.method?.toUpperCase();
  const path = event.path ?? '';
  const pathParams = event.pathParameters ?? {};
  const challengeId = pathParams.challengeId;

  const isRespond = path.includes('/respond');
  const isCancel = path.includes('/cancel');
  const isBulkDelete = path.includes('bulk-delete');

  if (method === 'POST' && isBulkDelete) {
    return bulkDeleteChallengesHandler(event, context);
  }
  if (method === 'GET' && !challengeId) {
    return getChallengesHandler(event, context);
  }
  if (method === 'GET' && challengeId) {
    return getChallengeHandler(event, context);
  }
  if (method === 'POST' && !challengeId) {
    return createChallengeHandler(event, context);
  }
  if (method === 'POST' && challengeId && isRespond) {
    return respondToChallengeHandler(event, context);
  }
  if (method === 'POST' && challengeId && isCancel) {
    return cancelChallengeHandler(event, context);
  }
  if (method === 'DELETE' && challengeId) {
    return deleteChallengeHandler(event, context);
  }

  return methodNotAllowed();
};
