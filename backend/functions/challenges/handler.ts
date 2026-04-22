import { handler as getChallengesHandler } from './getChallenges';
import { handler as getChallengeHandler } from './getChallenge';
import { handler as createChallengeHandler } from './createChallenge';
import { handler as respondToChallengeHandler } from './respondToChallenge';
import { handler as cancelChallengeHandler } from './cancelChallenge';
import { handler as deleteChallengeHandler } from './deleteChallenge';
import { handler as bulkDeleteChallengesHandler } from './bulkDeleteChallenges';
import { createRouter, type RouteConfig } from '../../lib/router';

/**
 * Single Lambda for challenges: routes by HTTP method and resource.
 * Replaces getChallenges, getChallenge, create, respond, cancel, delete, bulkDelete.
 */
const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/challenges',
    method: 'GET',
    handler: getChallengesHandler,
  },
  {
    resource: '/challenges/{challengeId}',
    method: 'GET',
    handler: getChallengeHandler,
  },
  {
    resource: '/challenges',
    method: 'POST',
    handler: createChallengeHandler,
    requireAuth: true,
  },
  {
    resource: '/challenges/{challengeId}/respond',
    method: 'POST',
    handler: respondToChallengeHandler,
    requireAuth: true,
  },
  {
    resource: '/challenges/{challengeId}/cancel',
    method: 'POST',
    handler: cancelChallengeHandler,
    requireAuth: true,
  },
  {
    resource: '/challenges/{challengeId}',
    method: 'DELETE',
    handler: deleteChallengeHandler,
    requireAuth: true,
  },
  {
    resource: '/challenges/bulk-delete',
    method: 'POST',
    handler: bulkDeleteChallengesHandler,
    requireAuth: true,
  },
];

export const handler = createRouter(routes);
