import { handler as getStablesHandler } from './getStables';
import { handler as getStableHandler } from './getStable';
import { handler as getStableStandingsHandler } from './getStableStandings';
import { handler as createStableHandler } from './createStable';
import { handler as updateStableHandler } from './updateStable';
import { handler as approveStableHandler } from './approveStable';
import { handler as rejectStableHandler } from './rejectStable';
import { handler as inviteToStableHandler } from './inviteToStable';
import { handler as getInvitationsHandler } from './getInvitations';
import { handler as respondToInvitationHandler } from './respondToInvitation';
import { handler as disbandStableHandler } from './disbandStable';
import { handler as reactivateStableHandler } from './reactivateStable';
import { handler as removeMemberHandler } from './removeMember';
import { handler as deleteStableHandler } from './deleteStable';
import { handler as postMessageHandler } from './postMessage';
import { handler as getMessagesHandler } from './getMessages';
import { handler as postDirectMessageHandler } from './postDirectMessage';
import { handler as getDirectMessageThreadHandler } from './getDirectMessageThread';
import { handler as getMyDirectMessageThreadsHandler } from './getMyDirectMessageThreads';
import { handler as getFactionStatsHandler } from './getFactionStats';
import { createRouter, type RouteConfig } from '../../lib/router';

/**
 * Single Lambda for stables: routes by HTTP method and resource.
 */
const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/stables',
    method: 'GET',
    handler: getStablesHandler,
  },
  {
    resource: '/stables/standings',
    method: 'GET',
    handler: getStableStandingsHandler,
  },
  {
    resource: '/stables/{stableId}',
    method: 'GET',
    handler: getStableHandler,
  },
  {
    resource: '/stables',
    method: 'POST',
    handler: createStableHandler,
    requireAuth: true,
  },
  {
    resource: '/stables/{stableId}',
    method: 'PUT',
    handler: updateStableHandler,
    requireAuth: true,
  },
  {
    resource: '/stables/{stableId}/approve',
    method: 'POST',
    handler: approveStableHandler,
    requireAuth: true,
  },
  {
    resource: '/stables/{stableId}/reject',
    method: 'POST',
    handler: rejectStableHandler,
    requireAuth: true,
  },
  {
    resource: '/stables/{stableId}/invitations',
    method: 'GET',
    handler: getInvitationsHandler,
    requireAuth: true,
  },
  {
    resource: '/stables/{stableId}/invitations',
    method: 'POST',
    handler: inviteToStableHandler,
    requireAuth: true,
  },
  {
    resource: '/stables/{stableId}/invitations/{invitationId}/respond',
    method: 'POST',
    handler: respondToInvitationHandler,
    requireAuth: true,
  },
  {
    resource: '/stables/{stableId}/disband',
    method: 'POST',
    handler: disbandStableHandler,
    requireAuth: true,
  },
  {
    resource: '/stables/{stableId}/reactivate',
    method: 'POST',
    handler: reactivateStableHandler,
    requireAuth: true,
  },
  {
    resource: '/stables/{stableId}/remove-member',
    method: 'POST',
    handler: removeMemberHandler,
    requireAuth: true,
  },
  {
    resource: '/stables/{stableId}/messages',
    method: 'GET',
    handler: getMessagesHandler,
    requireAuth: true,
  },
  {
    resource: '/stables/{stableId}/messages',
    method: 'POST',
    handler: postMessageHandler,
    requireAuth: true,
  },
  {
    resource: '/stables/{stableId}/direct-messages',
    method: 'GET',
    handler: getMyDirectMessageThreadsHandler,
    requireAuth: true,
  },
  {
    resource: '/stables/{stableId}/direct-messages',
    method: 'POST',
    handler: postDirectMessageHandler,
    requireAuth: true,
  },
  {
    resource: '/stables/{stableId}/direct-messages/{partnerPlayerId}',
    method: 'GET',
    handler: getDirectMessageThreadHandler,
    requireAuth: true,
  },
  {
    resource: '/stables/{stableId}/stats',
    method: 'GET',
    handler: getFactionStatsHandler,
  },
  {
    resource: '/stables/{stableId}',
    method: 'DELETE',
    handler: deleteStableHandler,
    requireAuth: true,
  },
];

export const handler = createRouter(routes);
