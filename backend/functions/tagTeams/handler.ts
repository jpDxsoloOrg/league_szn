import { handler as getTagTeamsHandler } from './getTagTeams';
import { handler as getTagTeamHandler } from './getTagTeam';
import { handler as getTagTeamStandingsHandler } from './getTagTeamStandings';
import { handler as createTagTeamHandler } from './createTagTeam';
import { handler as updateTagTeamHandler } from './updateTagTeam';
import { handler as respondToTagTeamHandler } from './respondToTagTeam';
import { handler as approveTagTeamHandler } from './approveTagTeam';
import { handler as rejectTagTeamHandler } from './rejectTagTeam';
import { handler as dissolveTagTeamHandler } from './dissolveTagTeam';
import { handler as deleteTagTeamHandler } from './deleteTagTeam';
import { createRouter, type RouteConfig, ADMIN_ONLY, STAFF } from '../../lib/router';

/**
 * Single Lambda for tag teams: routes by HTTP method and resource.
 */
export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/tag-teams',
    method: 'GET',
    handler: getTagTeamsHandler,
    access: 'public',
  },
  {
    resource: '/tag-teams/standings',
    method: 'GET',
    handler: getTagTeamStandingsHandler,
    access: 'public',
  },
  {
    resource: '/tag-teams/{tagTeamId}',
    method: 'GET',
    handler: getTagTeamHandler,
    access: 'public',
  },
  {
    resource: '/tag-teams',
    method: 'POST',
    handler: createTagTeamHandler,
    access: 'self-service',
  },
  {
    resource: '/tag-teams/{tagTeamId}',
    method: 'PUT',
    handler: updateTagTeamHandler,
    access: 'self-service',
  },
  {
    resource: '/tag-teams/{tagTeamId}/respond',
    method: 'POST',
    handler: respondToTagTeamHandler,
    access: 'self-service',
  },
  {
    resource: '/tag-teams/{tagTeamId}/approve',
    method: 'POST',
    handler: approveTagTeamHandler,
    access: STAFF,
  },
  {
    resource: '/tag-teams/{tagTeamId}/reject',
    method: 'POST',
    handler: rejectTagTeamHandler,
    access: STAFF,
  },
  {
    resource: '/tag-teams/{tagTeamId}/dissolve',
    method: 'POST',
    handler: dissolveTagTeamHandler,
    access: 'self-service',
  },
  {
    resource: '/tag-teams/{tagTeamId}',
    method: 'DELETE',
    handler: deleteTagTeamHandler,
    access: ADMIN_ONLY,
  },
];

export const handler = createRouter(routes);
