import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { getOrNotFound } from '../../lib/router';

const MAX_BIO_LENGTH = 255;

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { data: body, error: parseError } = parseBody(event);
    if (parseError) return parseError;

    // Check bio length
    if (body.bio && body.bio.length > MAX_BIO_LENGTH) {
      return badRequest('Bio cannot exceed 255 characters');
    }

    const playerResult = await getOrNotFound(TableNames.PLAYERS, { playerId: event.pathParameters!.playerId }, 'Player not found');
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
      Key: { playerId: event.pathParameters!.playerId },
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

// Helper function to build the UpdateExpression and attribute values
function buildUpdateExpression(fields: Record<string, unknown>, options?: { removeFields?: string[] }) {
  const setExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {};
  let hasChanges = false;

  for (const [field, value] of Object.entries(fields)) {
    if (value !== undefined) {
      setExpressions.push(`#${field} = :${field}`);
      expressionAttributeNames[`#${field}`] = field;
      expressionAttributeValues[`:${field}`] = value;
      hasChanges = true;
    }
  }

  const removeExpression: string[] = [];
  if (options?.removeFields) {
    for (const field of options.removeFields) {
      removeExpression.push(`#${field}`);
      expressionAttributeNames[`#${field}`] = field;
      hasChanges = true;
    }
  }

  return {
    UpdateExpression: `${setExpressions.length > 0 ? 'SET ' + setExpressions.join(', ') : ''}${removeExpression.length > 0 ? (setExpressions.length > 0 ? ', ' : '') + 'REMOVE ' + removeExpression.join(', ')}`,
    ExpressionAttributeNames,
    ExpressionAttributeValues,
    hasChanges,
  };
}