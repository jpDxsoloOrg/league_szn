import { handler as getPlayersHandler } from './getPlayers';
import { handler as createPlayerHandler } from './createPlayer';
import { handler as updatePlayerHandler } from './updatePlayer';
import { handler as deletePlayerHandler } from './deletePlayer';
import { handler as getMyProfileHandler } from './getMyProfile';
import { handler as updateMyProfileHandler } from './updateMyProfile';
import { createRouter, type RouteConfig } from '../../lib/router';
import { handler as getPlayerStatisticsHandler } from './getPlayerStatistics';
import { validateBio } from '../../lib/validators'; // Assuming we have a validators file

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
    handler: async (event) => {
      // Validate bio field
      if (event.body && typeof event.body === 'object' && 'bio' in event.body) {
        const { bio } = event.body;
        const validationError = validateBio(bio);
        if (validationError) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: validationError }),
          };
        }
      }
      // Proceed with the original handler
      return updateMyProfileHandler(event);
    },
  },
  {
    resource: '/players',
    method: 'POST',
    handler: createPlayerHandler,
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

<<<< CONFLICT: multiple tasks modified this file >>>>
# From task: 20eccc9d-33e1-4052-9133-a88beff31fc7
import { handler as getPlayersHandler } from './getPlayers';
import { handler as createPlayerHandler } from './createPlayer';
import { handler as updatePlayerHandler } from './updatePlayer';
import { handler as deletePlayerHandler } from './deletePlayer';
import { handler as getMyProfileHandler } from './getMyProfile';
import { handler as updateMyProfileHandler } from './updateMyProfile';
import { createRouter, type RouteConfig } from '../../lib/router';
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