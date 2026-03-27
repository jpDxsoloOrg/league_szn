import { handler as getPlayersHandler } from './getPlayers';
import { handler as createPlayerHandler } from './createPlayer';
import { handler as updatePlayerHandler } from './updatePlayer';
import { handler as deletePlayerHandler } from './deletePlayer';
import { handler as getMyProfileHandler } from './getMyProfile';
import { handler as updateMyProfileHandler } from './updateMyProfile';
import { createRouter, type RouteConfig } from '../../lib/router';
import { handler as getPlayerHandler } from './getPlayer';
import { handler as getPlayerStatisticsHandler } from './getPlayerStatistics';


/**
 * Single Lambda for players: routes by HTTP method and path.
 * Replaces getPlayers, createPlayer, updatePlayer, deletePlayer, getMyProfile, updateMyProfile, getPlayerStatistics.
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
  },
  {
    resource: '/players/me',
    method: 'PUT',
    handler: updateMyProfileHandler,
  },
  {
    resource: '/players',
    method: 'POST',
    handler: createPlayerHandler,
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
  },
  {
    resource: '/players/{playerId}',
    method: 'DELETE',
    handler: deletePlayerHandler,
  },
];
export const handler = createRouter(routes);