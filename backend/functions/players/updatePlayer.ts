import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireRole, parseBody, respondWithJson } from '../../lib/router';
import { getUserFromToken } from '../../lib/handlers';

export const handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const user = await getUserFromToken(event.headers['Authorization']);
  
  if (!user) {
    return respondWithJson(401, { message: 'Unauthorized' });
  }

  requireRole(user.role, ['admin']);

  const body = parseBody(event.body);

  if (typeof body.playerId !== 'string') {
    return respondWithJson(400, { message: 'Invalid playerId' });
  }

  if (!body.bio || typeof body.bio !== 'string' || body.bio.length > 255) {
    return respondWithJson(400, { message: 'Invalid bio' });
  }

  // Assuming updatePlayerProfile is a function that updates the player's profile
  const success = await updatePlayerProfile(body.playerId, { bio: body.bio });

  if (success) {
    return respondWithJson(200, { message: 'Player updated successfully' });
  } else {
    return respondWithJson(500, { message: 'Failed to update player' });
  }
};

<<<< CONFLICT: multiple tasks modified this file >>>>
# From task: 0fc15840-412f-4d01-b081-9abdf0dbbfab
import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { buildUpdateExpression, getOrNotFound } from '../../lib/dynamodbUtils';
import { success, badRequest, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;

    if (!playerId) {
      return badRequest('Player ID is required');
    }

    const { data: body, error: parseError } = parseBody(event);
    if (parseError) return parseError;

    // Check bio length
    if (body.bio && body.bio.length > 255) {
      return badRequest('Bio cannot exceed 255 characters');
    }

    const playerResult = await getOrNotFound(TableNames.PLAYERS, { playerId }, 'Player not found');
    if ('notFoundResponse' in playerResult) {
      return playerResult.notFoundResponse;
    }

    const updateFields: Record<string, unknown> = {
      currentWrestler: body.currentWrestler,
      name: body.name,
      imageUrl: body.imageUrl,
      bio: body.bio,
    };
    const removeFields: string[] = [];

    if (body.divisionId !== undefined) {
      if (body.divisionId === '' || body.divisionId === null) {
        // Remove divisionId if empty string or null
        removeFields.push('divisionId');
      } else {
        // Validate that the division exists
        const divisionResult = await getOrNotFound(
          TableNames.DIVISIONS,
          { divisionId: body.divisionId },
          `Division ${body.divisionId} not found`
        );
        if ('notFoundResponse' in divisionResult) {
          return divisionResult.notFoundResponse;
        }
        updateFields.divisionId = body.divisionId;
      }
    }

    const updateExpr = buildUpdateExpression(updateFields, {
      removeFields,
    });

    if (!updateExpr.hasChanges) {
      return badRequest('No valid fields to update');
    }

    const result = await dynamoDb.update({
      TableName: TableNames.PLAYERS,
      Key: { playerId },
      UpdateExpression: updateExpr.UpdateExpression,
      ExpressionAttributeNames: updateExpr.ExpressionAttributeNames,
      ExpressionAttributeValues: updateExpr.ExpressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return success(result.Attributes);
  } catch (err) {
    console.error('Error updating player:', err);
    return serverError('Failed to update player');
  }
};