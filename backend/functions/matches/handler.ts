import { handler as getMatchesHandler } from './getMatches';
import { handler as scheduleMatchHandler } from './scheduleMatch';
import { handler as recordResultHandler } from './recordResult';
import { handler as updateMatchHandler } from './updateMatch';
import { handler as deleteMatchHandler } from './deleteMatch';
import { handler as claimSlotHandler } from './claimSlot';
import { handler as releaseSlotHandler } from './releaseSlot';
import { handler as adminUpdateSlotHandler } from './adminUpdateSlot';
import { handler as setMatchOfTheNightHandler } from './setMatchOfTheNight';
import { handler as submitRatingHandler } from './submitRating';
import { createRouter, type RouteConfig, STAFF } from '../../lib/router';

/**
 * Single Lambda for matches: routes by HTTP method and resource.
 * Replaces getMatches, scheduleMatch, recordResult, updateMatch, deleteMatch.
 */
export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/matches',
    method: 'GET',
    handler: getMatchesHandler,
    access: 'public',
  },
  {
    resource: '/matches',
    method: 'POST',
    handler: scheduleMatchHandler,
    access: STAFF,
  },
  {
    resource: '/matches/{matchId}/result',
    method: 'PUT',
    handler: recordResultHandler,
    access: STAFF,
  },
  {
    resource: '/matches/{matchId}/slots/{slotId}/claim',
    method: 'POST',
    handler: claimSlotHandler,
    access: 'self-service',
  },
  {
    resource: '/matches/{matchId}/slots/{slotId}/claim',
    method: 'DELETE',
    handler: releaseSlotHandler,
    access: 'self-service',
  },
  {
    resource: '/matches/{matchId}/slots/{slotId}',
    method: 'PUT',
    handler: adminUpdateSlotHandler,
    access: STAFF,
  },
  {
    resource: '/matches/{matchId}/motn',
    method: 'PUT',
    handler: setMatchOfTheNightHandler,
    access: STAFF,
  },
  {
    resource: '/matches/{matchId}/ratings',
    method: 'POST',
    handler: submitRatingHandler,
    access: 'self-service',
  },
  {
    resource: '/matches/{matchId}',
    method: 'PUT',
    handler: updateMatchHandler,
    access: STAFF,
  },
  {
    resource: '/matches/{matchId}',
    method: 'DELETE',
    handler: deleteMatchHandler,
    access: STAFF,
  },
];

export const handler = createRouter(routes);
