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
import { handler as removeMemberHandler } from './removeMember';
import { handler as deleteStableHandler } from './deleteStable';
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
  },
  {
    resource: '/stables/{stableId}',
    method: 'PUT',
    handler: updateStableHandler,
  },
  {
    resource: '/stables/{stableId}/approve',
    method: 'POST',
    handler: approveStableHandler,
  },
  {
    resource: '/stables/{stableId}/reject',
    method: 'POST',
    handler: rejectStableHandler,
  },
  {
    resource: '/stables/{stableId}/invitations',
    method: 'GET',
    handler: getInvitationsHandler,
  },
  {
    resource: '/stables/{stableId}/invitations',
    method: 'POST',
    handler: inviteToStableHandler,
  },
  {
    resource: '/stables/{stableId}/invitations/{invitationId}/respond',
    method: 'POST',
    handler: respondToInvitationHandler,
  },
  {
    resource: '/stables/{stableId}/disband',
    method: 'POST',
    handler: disbandStableHandler,
  },
  {
    resource: '/stables/{stableId}/remove-member',
    method: 'POST',
    handler: removeMemberHandler,
  },
  {
    resource: '/stables/{stableId}',
    method: 'DELETE',
    handler: deleteStableHandler,
  },
];

export const handler = createRouter(routes);
