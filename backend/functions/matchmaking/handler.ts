import { handler as heartbeatHandler } from './heartbeat';
import { handler as leavePresenceHandler } from './leavePresence';
import { handler as joinQueueHandler } from './joinQueue';
import { handler as leaveQueueHandler } from './leaveQueue';
import { handler as getQueueHandler } from './getQueue';
import { handler as getOnlineHandler } from './getOnline';
import { handler as createInvitationHandler } from './createInvitation';
import { handler as getInvitationsHandler } from './getInvitations';
import { handler as acceptInvitationHandler } from './acceptInvitation';
import { handler as declineInvitationHandler } from './declineInvitation';
import { createRouter, type RouteConfig } from '../../lib/router';

/**
 * Single Lambda for matchmaking: routes by HTTP method and resource.
 * Handles presence, queue, and invitation endpoints.
 */
const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/matchmaking/heartbeat',
    method: 'POST',
    handler: heartbeatHandler,
  },
  {
    resource: '/matchmaking/presence',
    method: 'DELETE',
    handler: leavePresenceHandler,
  },
  {
    resource: '/matchmaking/queue/join',
    method: 'POST',
    handler: joinQueueHandler,
  },
  {
    resource: '/matchmaking/queue/leave',
    method: 'POST',
    handler: leaveQueueHandler,
  },
  {
    resource: '/matchmaking/queue',
    method: 'GET',
    handler: getQueueHandler,
  },
  {
    resource: '/matchmaking/online',
    method: 'GET',
    handler: getOnlineHandler,
  },
  {
    resource: '/matchmaking/invite',
    method: 'POST',
    handler: createInvitationHandler,
  },
  {
    resource: '/matchmaking/invitations',
    method: 'GET',
    handler: getInvitationsHandler,
  },
  {
    resource: '/matchmaking/invitations/{invitationId}/accept',
    method: 'POST',
    handler: acceptInvitationHandler,
  },
  {
    resource: '/matchmaking/invitations/{invitationId}/decline',
    method: 'POST',
    handler: declineInvitationHandler,
  },
];

export const handler = createRouter(routes);
