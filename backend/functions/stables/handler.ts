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
import { handler as getFactionScheduleHandler } from './getFactionSchedule';
import { handler as getFactionPromosHandler } from './getFactionPromos';
import { createRouter, type RouteConfig, ADMIN_ONLY, STAFF } from '../../lib/router';

/**
 * Single Lambda for stables: routes by HTTP method and resource.
 */
export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/stables',
    method: 'GET',
    handler: getStablesHandler,
    access: 'public',
  },
  {
    resource: '/stables/standings',
    method: 'GET',
    handler: getStableStandingsHandler,
    access: 'public',
  },
  {
    resource: '/stables/{stableId}',
    method: 'GET',
    handler: getStableHandler,
    access: 'public',
  },
  {
    resource: '/stables',
    method: 'POST',
    handler: createStableHandler,
    access: 'self-service',
  },
  {
    resource: '/stables/{stableId}',
    method: 'PUT',
    handler: updateStableHandler,
    access: 'self-service',
  },
  {
    resource: '/stables/{stableId}/approve',
    method: 'POST',
    handler: approveStableHandler,
    access: STAFF,
  },
  {
    resource: '/stables/{stableId}/reject',
    method: 'POST',
    handler: rejectStableHandler,
    access: STAFF,
  },
  {
    resource: '/stables/{stableId}/invitations',
    method: 'GET',
    handler: getInvitationsHandler,
    access: 'self-service',
  },
  {
    resource: '/stables/{stableId}/invitations',
    method: 'POST',
    handler: inviteToStableHandler,
    access: 'self-service',
  },
  {
    resource: '/stables/{stableId}/invitations/{invitationId}/respond',
    method: 'POST',
    handler: respondToInvitationHandler,
    access: 'self-service',
  },
  {
    resource: '/stables/{stableId}/disband',
    method: 'POST',
    handler: disbandStableHandler,
    access: 'self-service',
  },
  {
    resource: '/stables/{stableId}/reactivate',
    method: 'POST',
    handler: reactivateStableHandler,
    access: STAFF,
  },
  {
    resource: '/stables/{stableId}/remove-member',
    method: 'POST',
    handler: removeMemberHandler,
    access: 'self-service',
  },
  {
    resource: '/stables/{stableId}/messages',
    method: 'GET',
    handler: getMessagesHandler,
    access: 'self-service',
  },
  {
    resource: '/stables/{stableId}/messages',
    method: 'POST',
    handler: postMessageHandler,
    access: 'self-service',
  },
  {
    resource: '/stables/{stableId}/direct-messages',
    method: 'GET',
    handler: getMyDirectMessageThreadsHandler,
    access: 'self-service',
  },
  {
    resource: '/stables/{stableId}/direct-messages',
    method: 'POST',
    handler: postDirectMessageHandler,
    access: 'self-service',
  },
  {
    resource: '/stables/{stableId}/direct-messages/{partnerPlayerId}',
    method: 'GET',
    handler: getDirectMessageThreadHandler,
    access: 'self-service',
  },
  {
    resource: '/stables/{stableId}/stats',
    method: 'GET',
    handler: getFactionStatsHandler,
    access: 'public',
  },
  {
    resource: '/stables/{stableId}/schedule',
    method: 'GET',
    handler: getFactionScheduleHandler,
    access: 'public',
  },
  {
    resource: '/stables/{stableId}/promos',
    method: 'GET',
    handler: getFactionPromosHandler,
    access: 'public',
  },
  {
    resource: '/stables/{stableId}',
    method: 'DELETE',
    handler: deleteStableHandler,
    access: ADMIN_ONLY,
  },
];

export const handler = createRouter(routes);
