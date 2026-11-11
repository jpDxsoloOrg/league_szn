import { handler as getChallengesHandler } from './getChallenges';
import { handler as getChallengeHandler } from './getChallenge';
import { handler as createChallengeHandler } from './createChallenge';
import { handler as respondToChallengeHandler } from './respondToChallenge';
import { handler as cancelChallengeHandler } from './cancelChallenge';
import { handler as deleteChallengeHandler } from './deleteChallenge';
import { handler as bulkDeleteChallengesHandler } from './bulkDeleteChallenges';
import { createRouter, type RouteConfig, ADMIN_ONLY } from '../../lib/router';

/**
 * Single Lambda for challenges: routes by HTTP method and resource.
 * Replaces getChallenges, getChallenge, create, respond, cancel, delete, bulkDelete.
 */
export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/challenges',
    method: 'GET',
    handler: getChallengesHandler,
    access: 'public',
  },
  {
    resource: '/challenges/{challengeId}',
    method: 'GET',
    handler: getChallengeHandler,
    access: 'public',
  },
  {
    resource: '/challenges',
    method: 'POST',
    handler: createChallengeHandler,
    access: 'self-service',
  },
  {
    resource: '/challenges/{challengeId}/respond',
    method: 'POST',
    handler: respondToChallengeHandler,
    access: 'self-service',
  },
  {
    resource: '/challenges/{challengeId}/cancel',
    method: 'POST',
    handler: cancelChallengeHandler,
    access: 'self-service',
  },
  {
    resource: '/challenges/{challengeId}',
    method: 'DELETE',
    handler: deleteChallengeHandler,
    access: ADMIN_ONLY,
  },
  {
    resource: '/challenges/bulk-delete',
    method: 'POST',
    handler: bulkDeleteChallengesHandler,
    access: ADMIN_ONLY,
  },
];

export const handler = createRouter(routes);
