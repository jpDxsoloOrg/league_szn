import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

interface UpdateMatchTypeBody {
  name?: string;
  description?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const matchTypeId = event.pathParameters?.matchTypeId;
    if (!matchTypeId) {
      return badRequest('Match type ID is required');
    }

    const { data: body, error: parseError } = parseBody<UpdateMatchTypeBody>(event);
    if (parseError) return parseError;

    const existingMatchType = await dynamoDb.get({
      TableName: TableNames.MATCH_TYPES,
      Key: { matchTypeId },
    });

    if (!existingMatchType.Item) {
      return notFound('Match type not found');
    }

    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, string> = {};

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

    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    const result = await dynamoDb.update({
      TableName: TableNames.MATCH_TYPES,
      Key: { matchTypeId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return success(result.Attributes);
  } catch (err) {
    console.error('Error updating match type:', err);
    return serverError('Failed to update match type');
  }
};
