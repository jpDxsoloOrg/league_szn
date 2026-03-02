import { handler as getPlayersHandler } from './getPlayers';
import { handler as createPlayerHandler } from './createPlayer';
import { handler as updatePlayerHandler } from './updatePlayer';
import { handler as deletePlayerHandler } from './deletePlayer';
import { handler as getMyProfileHandler } from './getMyProfile';
import { handler as updateMyProfileHandler } from './updateMyProfile';
import { createRouter, type RouteConfig } from '../../lib/router';
import { handler as getPlayerStatisticsHandler } from './getPlayerStatistics';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';


/**
 * Validation middleware for updateMyProfile bio field.
 * 
 * Rules:
 * - bio must be a string if present
 * - Trimmed bio length must not exceed 255 characters
 * - Empty/whitespace-only bio is removed from request (leaves DB value unchanged)
 * - Trimmed bio is passed to handler for consistent storage
 */
function validateBioMiddleware(
  event: APIGatewayProxyEvent
): APIGatewayProxyResult | null {
  if (!event.body) {
    return null; // No body, let handler process normally
  }

  let parsedBody: any;
  try {
    parsedBody = JSON.parse(event.body);
  } catch (error) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Invalid JSON in request body',
      }),
    };
  }

  // If bio field is not present, no validation needed
  if (!('bio' in parsedBody)) {
    return null;
  }

  const { bio } = parsedBody;

  // Type check: bio must be string, null, or undefined
  if (bio !== null && bio !== undefined && typeof bio !== 'string') {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Bio must be a string',
      }),
    };
  }

  // Handle null, undefined, or string values
  if (bio === null || bio === undefined || typeof bio !== 'string') {
    // Remove bio from body to leave existing value unchanged
    delete parsedBody.bio;
    event.body = JSON.stringify(parsedBody);
    return null;
  }

  // Trim the bio for validation and storage
  const trimmedBio = bio.trim();

  // If bio is empty/whitespace-only, remove it from request
  if (trimmedBio.length === 0) {
    delete parsedBody.bio;
    event.body = JSON.stringify(parsedBody);
    return null;
  }

  // Validate length (using character count for consistency)
  if (trimmedBio.length > 255) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Bio must not exceed 255 characters',
      }),
    };
  }

  // Update body with trimmed bio for consistent storage
  parsedBody.bio = trimmedBio;
  event.body = JSON.stringify(parsedBody);

  return null; // Validation passed
}

/**
 * Wrapper for updateMyProfile that includes bio validation.
 */
async function updateMyProfileWithValidation(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const validationError = validateBioMiddleware(event);
  if (validationError) {
    return validationError;
  }
  return updateMyProfileHandler(event);
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
    handler: updateMyProfileWithValidation,
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
# From task: 44faa882-f509-4ef0-bcde-35ab38ca3983
import { handler as getPlayersHandler } from './getPlayers';
import { handler as createPlayerHandler } from './createPlayer';
import { handler as updatePlayerHandler } from './updatePlayer';
import { handler as deletePlayerHandler } from './deletePlayer';
import { handler as getMyProfileHandler } from './getMyProfile';
import { handler as updateMyProfileHandler } from './updateMyProfile';
import { createRouter, type RouteConfig } from '../../lib/router';
import { handler as getPlayerStatisticsHandler } from './getPlayerStatistics';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Handler } from 'aws-lambda';


/**
 * Single Lambda for players: routes by HTTP method and path.
 * Replaces getPlayers, createPlayer, updatePlayer, deletePlayer, getMyProfile, updateMyProfile, getPlayerStatistics.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

/**
 * Validates bio field in request body.
 * - Bio must be a string or null/undefined
 * - Bio length (before trimming) must not exceed 255 characters
 * - Empty or whitespace-only bios are treated as absent (not stored)
 * - Trimmed bio is stored to normalize whitespace
 * 
 * @param body - The request body (must be an object)
 * @returns Validation result with error message if invalid
 */
function validateBio(body: unknown): { valid: boolean; error?: string; normalizedBio?: string | null } {
  if (typeof body !== 'object' || body === null) {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const bodyObj = body as Record<string, unknown>;

  // Bio field is optional - if not present, validation passes
  if (!('bio' in bodyObj)) {
    return { valid: true };
  }

  const { bio } = bodyObj;

  // Null or undefined bio is valid (means keep existing value)
  if (bio === null || bio === undefined) {
    return { valid: true, normalizedBio: null };
  }

  // Bio must be a string
  if (typeof bio !== 'string') {
    return { valid: false, error: 'Bio must be a string' };
  }

  // Validate length BEFORE trimming to catch overly long inputs
  if (bio.length > 255) {
    return { valid: false, error: 'Bio must not exceed 255 characters' };
  }

  // Trim whitespace for storage
  const trimmedBio = bio.trim();

  // Empty or whitespace-only bio is treated as absent (null means don't update)
  if (trimmedBio.length === 0) {
    return { valid: true, normalizedBio: null };
  }

  return { valid: true, normalizedBio: trimmedBio };
}

/**
 * Wraps a handler to add bio validation for player update operations.
 * Ensures consistent validation across both updatePlayer and updateMyProfile endpoints.
 * 
 * @param originalHandler - The original handler function to wrap
 * @returns Wrapped handler with bio validation
 */
function withBioValidation(originalHandler: Handler<APIGatewayProxyEvent, APIGatewayProxyResult>): Handler<APIGatewayProxyEvent, APIGatewayProxyResult> {
  return async (event: APIGatewayProxyEvent, context, callback) => {
    // Parse request body
    let body: unknown;
    try {
      if (!event.body) {
        body = {};
      } else if (typeof event.body === 'string') {
        body = JSON.parse(event.body);
      } else {
        body = event.body;
      }
    } catch (error) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          message: 'Invalid JSON format in request body',
        }),
      };
    }

    // Validate bio field
    const validation = validateBio(body);
    if (!validation.valid) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          message: validation.error,
        }),
      };
    }

    // Normalize the body based on validation result
    if (typeof body === 'object' && body !== null && 'bio' in body) {
      const bodyObj = body as Record<string, unknown>;
      
      if (validation.normalizedBio === null) {
        // Remove bio from body - means "don't update this field"
        // This preserves the existing value in the database
        delete bodyObj.bio;
      } else {
        // Replace with normalized (trimmed) bio
        bodyObj.bio = validation.normalizedBio;
      }

      // Update event body with normalized data
      event.body = JSON.stringify(bodyObj);
    }

    // Call original handler with validated and normalized body
    return originalHandler(event, context, callback);
  };
}

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
    handler: withBioValidation(updateMyProfileHandler),
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
    handler: withBioValidation(updatePlayerHandler),
  },
  {
    resource: '/players/{playerId}',
    method: 'DELETE',
    handler: deletePlayerHandler,
  },
];
export const handler = createRouter(routes);