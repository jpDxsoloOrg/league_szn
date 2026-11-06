import { handler as getPlayersHandler } from './getPlayers';
import { handler as createPlayerHandler } from './createPlayer';
import { handler as updatePlayerHandler } from './updatePlayer';
import { handler as deletePlayerHandler } from './deletePlayer';
import { handler as getMyProfileHandler } from './getMyProfile';
import { handler as updateMyProfileHandler } from './updateMyProfile';
import { createRouter, type RouteConfig, STAFF } from '../../lib/router';
import { handler as getPlayerHandler } from './getPlayer';
import { handler as getBookingSummaryHandler } from './getBookingSummary';
import { handler as getPlayerStatisticsHandler } from './getPlayerStatistics';


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
];
export const handler = createRouter(routes);
