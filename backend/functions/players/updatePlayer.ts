import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;

    if (!playerId) {
      return badRequest('Player ID is required');
    }

    const { data: body, error: parseError } = parseBody(event);
    if (parseError) return parseError;

    // Check if player exists
    const existing = await dynamoDb.get({
      TableName: TableNames.PLAYERS,
      Key: { playerId },
    });

    if (!existing.Item) {
      return notFound('Player not found');
    }

    // Build update expression
    const setExpressions: string[] = [];
    const removeExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (body.currentWrestler !== undefined) {
      setExpressions.push('#currentWrestler = :currentWrestler');
      expressionAttributeNames['#currentWrestler'] = 'currentWrestler';
      expressionAttributeValues[':currentWrestler'] = body.currentWrestler;
    }

    if (body.name !== undefined) {
      setExpressions.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = body.name;
    }

    if (body.imageUrl !== undefined) {
      setExpressions.push('#imageUrl = :imageUrl');
      expressionAttributeNames['#imageUrl'] = 'imageUrl';
      expressionAttributeValues[':imageUrl'] = body.imageUrl;
    }

    if (body.divisionId !== undefined) {
      if (body.divisionId === '' || body.divisionId === null) {
        // Remove divisionId if empty string or null
        removeExpressions.push('#divisionId');
        expressionAttributeNames['#divisionId'] = 'divisionId';
      } else {
        // Validate that the division exists
        const divisionResult = await dynamoDb.get({
          TableName: TableNames.DIVISIONS,
          Key: { divisionId: body.divisionId },
        });
        if (!divisionResult.Item) {
          return notFound(`Division ${body.divisionId} not found`);
        }
        setExpressions.push('#divisionId = :divisionId');
        expressionAttributeNames['#divisionId'] = 'divisionId';
        expressionAttributeValues[':divisionId'] = body.divisionId;
      }
    }

    // Always update the updatedAt timestamp
    setExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    if (setExpressions.length === 1 && removeExpressions.length === 0) {
      return badRequest('No valid fields to update');
    }

    // Build the full UpdateExpression
    let updateExpression = '';
    if (setExpressions.length > 0) {
      updateExpression = `SET ${setExpressions.join(', ')}`;
    }
    if (removeExpressions.length > 0) {
      updateExpression += ` REMOVE ${removeExpressions.join(', ')}`;
    }

    const result = await dynamoDb.update({
      TableName: TableNames.PLAYERS,
      Key: { playerId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined,
      ReturnValues: 'ALL_NEW',
    });

    return success(result.Attributes);
  } catch (err) {
    console.error('Error updating player:', err);
    return serverError('Failed to update player');
  }
};
