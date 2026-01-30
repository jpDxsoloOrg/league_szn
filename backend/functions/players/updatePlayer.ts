import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;

    if (!playerId) {
      return badRequest('Player ID is required');
    }

    if (!event.body) {
      return badRequest('Request body is required');
    }

    const body = JSON.parse(event.body);

    // Check if player exists
    const existing = await dynamoDb.get({
      TableName: TableNames.PLAYERS,
      Key: { playerId },
    });

    if (!existing.Item) {
      return notFound('Player not found');
    }

    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (body.currentWrestler !== undefined) {
      updateExpressions.push('#currentWrestler = :currentWrestler');
      expressionAttributeNames['#currentWrestler'] = 'currentWrestler';
      expressionAttributeValues[':currentWrestler'] = body.currentWrestler;
    }

    if (body.name !== undefined) {
      updateExpressions.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = body.name;
    }

    // Always update the updatedAt timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    if (updateExpressions.length === 1) {
      return badRequest('No valid fields to update');
    }

    const result = await dynamoDb.update({
      TableName: TableNames.PLAYERS,
      Key: { playerId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return success(result.Attributes);
  } catch (err) {
    console.error('Error updating player:', err);
    return serverError('Failed to update player');
  }
};
