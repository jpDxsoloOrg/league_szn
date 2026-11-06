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
export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/matchmaking/heartbeat',
    method: 'POST',
    handler: heartbeatHandler,
    access: 'self-service',
  },
  {
    resource: '/matchmaking/presence',
    method: 'DELETE',
    handler: leavePresenceHandler,
    access: 'self-service',
  },
  {
    resource: '/matchmaking/queue/join',
    method: 'POST',
    handler: joinQueueHandler,
    access: 'self-service',
  },
  {
    resource: '/matchmaking/queue/leave',
    method: 'POST',
    handler: leaveQueueHandler,
    access: 'self-service',
  },
  {
    resource: '/matchmaking/queue',
    method: 'GET',
    handler: getQueueHandler,
    access: 'self-service',
  },
  {
    resource: '/matchmaking/online',
    method: 'GET',
    handler: getOnlineHandler,
    access: 'self-service',
  },
  {
    resource: '/matchmaking/invite',
    method: 'POST',
    handler: createInvitationHandler,
    access: 'self-service',
  },
  {
    resource: '/matchmaking/invitations',
    method: 'GET',
    handler: getInvitationsHandler,
    access: 'self-service',
  },
  {
    resource: '/matchmaking/invitations/{invitationId}/accept',
    method: 'POST',
    handler: acceptInvitationHandler,
    access: 'self-service',
  },
  {
    resource: '/matchmaking/invitations/{invitationId}/decline',
    method: 'POST',
    handler: declineInvitationHandler,
    access: 'self-service',
  },
];

export const handler = createRouter(routes);
