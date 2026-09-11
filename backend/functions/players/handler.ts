import { handler as getPlayersHandler } from './getPlayers';
import { handler as createPlayerHandler } from './createPlayer';
import { handler as updatePlayerHandler } from './updatePlayer';
import { handler as deletePlayerHandler } from './deletePlayer';
import { handler as getMyProfileHandler } from './getMyProfile';
import { handler as updateMyProfileHandler } from './updateMyProfile';
import { createRouter, type RouteConfig } from '../../lib/router';
import { handler as getPlayerHandler } from './getPlayer';
import { handler as getBookingSummaryHandler } from './getBookingSummary';
import { handler as getPlayerStatisticsHandler } from './getPlayerStatistics';
import { handler as getSuspensionsHandler } from './getSuspensions';
import { handler as suspendPlayerHandler } from './suspendPlayer';
import { handler as reinstatePlayerHandler } from './reinstatePlayer';


/**
 * Single Lambda for players: routes by HTTP method and path.
 * Fronted by a /{proxy+} API Gateway route; requireAuth routes run JWT
 * verification in the router before dispatching to the handler.
 */

const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/players',
    method: 'GET',
    handler: getPlayersHandler,
  },
  {
    resource: '/players/me',
    method: 'GET',
    handler: getMyProfileHandler,
    requireAuth: true,
  },
  {
    resource: '/players/booking-summary',
    method: 'GET',
    handler: getBookingSummaryHandler,
    requireAuth: true,
  },
  {
    resource: '/players/me',
    method: 'PUT',
    handler: updateMyProfileHandler,
    requireAuth: true,
  },
  {
    resource: '/players',
    method: 'POST',
    handler: createPlayerHandler,
    requireAuth: true,
  },
  // Static segment: declared before '/players/{playerId}'. The router prefers
  // the match with the fewest path params anyway, but keep the order explicit.
  {
    resource: '/players/suspensions',
    method: 'GET',
    handler: getSuspensionsHandler,
    requireAuth: true,
  },
  {
    resource: '/players/{playerId}',
    method: 'GET',
    handler: getPlayerHandler,
  },
  {
    resource: '/players/{playerId}/statistics',
    method: 'GET',
    handler: getPlayerStatisticsHandler,
  },
  {
    resource: '/players/{playerId}',
    method: 'PUT',
    handler: updatePlayerHandler,
    requireAuth: true,
  },
  {
    resource: '/players/{playerId}',
    method: 'DELETE',
    handler: deletePlayerHandler,
    requireAuth: true,
  },
  {
    resource: '/players/{playerId}/suspend',
    method: 'POST',
    handler: suspendPlayerHandler,
    requireAuth: true,
  },
  {
    resource: '/players/{playerId}/reinstate',
    method: 'POST',
    handler: reinstatePlayerHandler,
    requireAuth: true,
  },
];
export const handler = createRouter(routes);
