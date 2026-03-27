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
import { createRouter, type RouteConfig } from '../../lib/router';

/**
 * Single Lambda for tag teams: routes by HTTP method and resource.
 */
const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/tag-teams',
    method: 'GET',
    handler: getTagTeamsHandler,
  },
  {
    resource: '/tag-teams/standings',
    method: 'GET',
    handler: getTagTeamStandingsHandler,
  },
  {
    resource: '/tag-teams/{tagTeamId}',
    method: 'GET',
    handler: getTagTeamHandler,
  },
  {
    resource: '/tag-teams',
    method: 'POST',
    handler: createTagTeamHandler,
  },
  {
    resource: '/tag-teams/{tagTeamId}',
    method: 'PUT',
    handler: updateTagTeamHandler,
  },
  {
    resource: '/tag-teams/{tagTeamId}/respond',
    method: 'POST',
    handler: respondToTagTeamHandler,
  },
  {
    resource: '/tag-teams/{tagTeamId}/approve',
    method: 'POST',
    handler: approveTagTeamHandler,
  },
  {
    resource: '/tag-teams/{tagTeamId}/reject',
    method: 'POST',
    handler: rejectTagTeamHandler,
  },
  {
    resource: '/tag-teams/{tagTeamId}/dissolve',
    method: 'POST',
    handler: dissolveTagTeamHandler,
  },
  {
    resource: '/tag-teams/{tagTeamId}',
    method: 'DELETE',
    handler: deleteTagTeamHandler,
  },
];

export const handler = createRouter(routes);
