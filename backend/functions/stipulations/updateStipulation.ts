import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

interface UpdateStipulationBody {
  name?: string;
  description?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const stipulationId = event.pathParameters?.stipulationId;

    if (!stipulationId) {
      return badRequest('Stipulation ID is required');
    }

    const { data: body, error: parseError } = parseBody<UpdateStipulationBody>(event);
    if (parseError) return parseError;

    // Check if stipulation exists
    const existingStipulation = await dynamoDb.get({
      TableName: TableNames.STIPULATIONS,
      Key: { stipulationId },
    });

    if (!existingStipulation.Item) {
      return notFound('Stipulation not found');
    }

    // Build update expression
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

    // Always update the updatedAt timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    const result = await dynamoDb.update({
      TableName: TableNames.STIPULATIONS,
      Key: { stipulationId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return success(result.Attributes);
  } catch (err) {
    console.error('Error updating stipulation:', err);
    return serverError('Failed to update stipulation');
  }
};
