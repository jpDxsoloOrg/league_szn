import { handler as getPlayersHandler } from './getPlayers';
import { handler as createPlayerHandler } from './createPlayer';
import { handler as updatePlayerHandler } from './updatePlayer';
import { handler as deletePlayerHandler } from './deletePlayer';
import { handler as getMyProfileHandler } from './getMyProfile';
import { handler as updateMyProfileHandler } from './updateMyProfile';
import { createRouter, type RouteConfig } from '../../lib/router';
import { handler as getPlayerStatisticsHandler } from './getPlayerStatistics';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// Standard CORS headers for all responses
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

/**
 * Validates that a string's byte length does not exceed the limit.
 * This is important for database VARCHAR fields which typically have byte limits.
 */
function getByteLength(str: string): number {
  return new TextEncoder().encode(str).length;
}

/**
 * Middleware to validate player bio field.
 * - Converts empty strings to null (for database consistency)
 * - Validates byte length (max 255 bytes for typical VARCHAR fields)
 * - Handles JSON parse errors gracefully
 */
function bioValidationMiddleware(
  handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>
): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    // Skip validation for non-JSON requests
    if (!event.body) {
      return handler(event);
    }

    let parsedBody: any;
    try {
      parsedBody = JSON.parse(event.body);
    } catch (error) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          message: 'Invalid JSON in request body',
          error: error instanceof Error ? error.message : 'JSON parse error',
        }),
      };
    }

    // Validate bio field if present
    if ('bio' in parsedBody) {
      // Convert empty string to null for database consistency
      if (parsedBody.bio === '') {
        parsedBody.bio = null;
      }

      // Validate byte length for non-null bio
      if (parsedBody.bio !== null && parsedBody.bio !== undefined) {
        if (typeof parsedBody.bio !== 'string') {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              message: 'Bio must be a string',
            }),
          };
        }

        const byteLength = getByteLength(parsedBody.bio);
        if (byteLength > 255) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              message: `Bio exceeds maximum byte length of 255 (current: ${byteLength} bytes)`,
            }),
          };
        }
      }
    }

    // Create a new event object to avoid mutation
    const modifiedEvent = {
      ...event,
      body: JSON.stringify(parsedBody),
    };

    return handler(modifiedEvent);
  };
}


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
    handler: bioValidationMiddleware(updateMyProfileHandler),
  },
  {
    resource: '/players',
    method: 'POST',
    handler: bioValidationMiddleware(createPlayerHandler),
  },
  {
    resource: '/players/{playerId}/statistics',
    method: 'GET',
    handler: getPlayerStatisticsHandler,
  },
  {
    resource: '/players/{playerId}',
    method: 'PUT',
    handler: bioValidationMiddleware(updatePlayerHandler),
  },
  {
    resource: '/players/{playerId}',
    method: 'DELETE',
    handler: deletePlayerHandler,
  },
];
export const handler = createRouter(routes);