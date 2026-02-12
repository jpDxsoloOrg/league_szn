import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

interface UpdateDivisionBody {
  name?: string;
  description?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const divisionId = event.pathParameters?.divisionId;

    if (!divisionId) {
      return badRequest('Division ID is required');
    }

    const { data: body, error: parseError } = parseBody<UpdateDivisionBody>(event);
    if (parseError) return parseError;

    // Check if division exists
    const existingDivision = await dynamoDb.get({
      TableName: TableNames.DIVISIONS,
      Key: { divisionId },
    });

    if (!existingDivision.Item) {
      return notFound('Division not found');
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

    if (body.description !== undefined) {
      updateExpressions.push('#description = :description');
      expressionAttributeNames['#description'] = 'description';
      expressionAttributeValues[':description'] = body.description;
    }

    // Always update the updatedAt timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    const result = await dynamoDb.update({
      TableName: TableNames.DIVISIONS,
      Key: { divisionId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return success(result.Attributes);
  } catch (err) {
    console.error('Error updating division:', err);
    return serverError('Failed to update division');
  }
};
