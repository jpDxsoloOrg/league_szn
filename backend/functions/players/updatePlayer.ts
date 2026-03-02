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

    const playerResult = await getOrNotFound(TableNames.PLAYERS, { playerId }, 'Player not found');
    if ('notFoundResponse' in playerResult) {
      return playerResult.notFoundResponse;
    }

    // Validate bio length
    if (body.bio !== undefined) {
      if (typeof body.bio === 'string' && body.bio.trim().length > 255) {
        return badRequest('Bio must be 255 characters or less');
      }
    }

    const updateFields: Record<string, unknown> = {
      currentWrestler: body.currentWrestler,
      name: body.name,
      imageUrl: body.imageUrl,
    };
    const removeFields: string[] = [];

    // Handle bio: store trimmed value, remove if empty/whitespace
    if (body.bio !== undefined) {
      const trimmedBio = typeof body.bio === 'string' ? body.bio.trim() : '';
      if (trimmedBio.length > 0) {
        updateFields.bio = trimmedBio;
      } else {
        removeFields.push('bio');
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
