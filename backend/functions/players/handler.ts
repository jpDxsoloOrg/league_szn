import { handler as getPlayersHandler } from './getPlayers';
import { handler as createPlayerHandler } from './createPlayer';
import { handler as updatePlayerHandler } from './updatePlayer';
import { handler as deletePlayerHandler } from './deletePlayer';
import { handler as getMyProfileHandler } from './getMyProfile';
import { handler as updateMyProfileHandler } from './updateMyProfile';
import { ADMIN_ONLY, createRouter, type RouteConfig, STAFF } from '../../lib/router';
import { handler as getPlayerHandler } from './getPlayer';
import { handler as getBookingSummaryHandler } from './getBookingSummary';
import { handler as getPlayerStatisticsHandler } from './getPlayerStatistics';
import { handler as getPlayerDisciplineHandler } from './getPlayerDiscipline';
import { handler as issueStrikeHandler } from './issueStrike';
import { handler as removeStrikeHandler } from './removeStrike';
import { handler as reactivatePlayerHandler } from './reactivatePlayer';


/**
 * Single Lambda for players: routes by HTTP method and path.
 * Fronted by a /{proxy+} API Gateway route; the router verifies the JWT and
 * enforces each route's access declaration before dispatching to the handler.
 */

export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/players',
    method: 'GET',
    handler: getPlayersHandler,
    access: 'public',
  },
  {
    resource: '/players/me',
    method: 'GET',
    handler: getMyProfileHandler,
    access: 'self-service',
  },
  {
    resource: '/players/booking-summary',
    method: 'GET',
    handler: getBookingSummaryHandler,
    access: STAFF,
  },
  {
    resource: '/players/me',
    method: 'PUT',
    handler: updateMyProfileHandler,
    access: 'self-service',
  },
  {
    resource: '/players',
    method: 'POST',
    handler: createPlayerHandler,
    access: STAFF,
  },
  {
    resource: '/players/{playerId}',
    method: 'GET',
    handler: getPlayerHandler,
    access: 'public',
  },
  {
    resource: '/players/{playerId}/statistics',
    method: 'GET',
    handler: getPlayerStatisticsHandler,
    access: 'public',
  },
  {
    resource: '/players/{playerId}',
    method: 'PUT',
    handler: updatePlayerHandler,
    access: STAFF,
  },
  {
    resource: '/players/{playerId}',
    method: 'DELETE',
    handler: deletePlayerHandler,
    access: STAFF,
  },
  {
    resource: '/players/{playerId}/discipline',
    method: 'GET',
    handler: getPlayerDisciplineHandler,
    access: STAFF,
  },
  {
    resource: '/players/{playerId}/strikes',
    method: 'POST',
    handler: issueStrikeHandler,
    access: ADMIN_ONLY,
  },
  {
    resource: '/players/{playerId}/strikes/{strikeId}/remove',
    method: 'POST',
    handler: removeStrikeHandler,
    access: ADMIN_ONLY,
  },
  {
    resource: '/players/{playerId}/reactivate',
    method: 'POST',
    handler: reactivatePlayerHandler,
    access: ADMIN_ONLY,
  },
];
export const handler = createRouter(routes);
