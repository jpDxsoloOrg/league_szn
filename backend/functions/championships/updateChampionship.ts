import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const championshipId = event.pathParameters?.championshipId;

    if (!championshipId) {
      return badRequest('Championship ID is required');
    }

    if (!event.body) {
      return badRequest('Request body is required');
    }

    const body = JSON.parse(event.body);

    // Check if championship exists
    const existing = await dynamoDb.get({
      TableName: TableNames.CHAMPIONSHIPS,
      Key: { championshipId },
    });

    if (!existing.Item) {
      return notFound('Championship not found');
    }

    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (body.name !== undefined) {
      updateExpressions.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = body.name;
    }

    if (body.type !== undefined) {
      updateExpressions.push('#type = :type');
      expressionAttributeNames['#type'] = 'type';
      expressionAttributeValues[':type'] = body.type;
    }

    if (body.imageUrl !== undefined) {
      updateExpressions.push('#imageUrl = :imageUrl');
      expressionAttributeNames['#imageUrl'] = 'imageUrl';
      expressionAttributeValues[':imageUrl'] = body.imageUrl;
    }

    if (body.isActive !== undefined) {
      updateExpressions.push('#isActive = :isActive');
      expressionAttributeNames['#isActive'] = 'isActive';
      expressionAttributeValues[':isActive'] = body.isActive;
    }

    if (body.currentChampion !== undefined) {
      updateExpressions.push('#currentChampion = :currentChampion');
      expressionAttributeNames['#currentChampion'] = 'currentChampion';
      expressionAttributeValues[':currentChampion'] = body.currentChampion;
    }

    if (body.divisionId !== undefined) {
      updateExpressions.push('#divisionId = :divisionId');
      expressionAttributeNames['#divisionId'] = 'divisionId';
      expressionAttributeValues[':divisionId'] = body.divisionId;
    }

    // Always update the updatedAt timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    if (updateExpressions.length === 1) {
      return badRequest('No valid fields to update');
    }

    const result = await dynamoDb.update({
      TableName: TableNames.CHAMPIONSHIPS,
      Key: { championshipId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return success(result.Attributes);
  } catch (err) {
    console.error('Error updating championship:', err);
    return serverError('Failed to update championship');
  }
};
