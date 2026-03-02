import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { buildUpdateExpression, getOrNotFound } from '../../lib/dynamodbUtils';
import { success, badRequest, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const playerId = event.pathParameters?.playerId;

    if (!playerId) {
      return badRequest('Player ID is required');
    }

    const { data: body, error: parseError } = parseBody(event);
    if (parseError) return parseError;

    const playerResult = await getOrNotFound(TableNames.PLAYERS, { playerId }, 'Player not found');
    if ('notFoundResponse' in playerResult) {
      return playerResult.notFoundResponse;
    }

    const updateFields: Record<string, unknown> = {};
    const removeFields: string[] = [];

    // Validate and process string fields
    if (body.currentWrestler !== undefined) {
      if (typeof body.currentWrestler !== 'string') {
        return badRequest('currentWrestler must be a string');
      }
      if (body.currentWrestler.length > 100) {
        return badRequest('currentWrestler must be 100 characters or less');
      }
      updateFields.currentWrestler = body.currentWrestler;
    }

    if (body.name !== undefined) {
      if (typeof body.name !== 'string') {
        return badRequest('name must be a string');
      }
      if (body.name.length > 100) {
        return badRequest('name must be 100 characters or less');
      }
      if (body.name.trim().length === 0) {
        return badRequest('Name cannot be empty');
      }
      updateFields.name = body.name;
    }

    if (body.imageUrl !== undefined) {
      if (typeof body.imageUrl !== 'string') {
        return badRequest('imageUrl must be a string');
      }
      if (body.imageUrl.length > 2048) {
        return badRequest('imageUrl must be 2048 characters or less');
      }
      updateFields.imageUrl = body.imageUrl;
    }

    if (body.bio !== undefined) {
      if (typeof body.bio !== 'string') {
        return badRequest('bio must be a string');
      }
      const trimmedBio = body.bio.trim();
      if (trimmedBio.length > 255) {
        return badRequest('Bio must be 255 characters or less');
      }
      if (trimmedBio.length === 0) {
        removeFields.push('bio');
      } else {
        updateFields.bio = trimmedBio;
      }
    }

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
