import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { buildUpdateExpression, getOrNotFound } from '../../lib/dynamodbUtils';
import { success, badRequest, serverError } from '../../lib/response';
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

    const stipulationResult = await getOrNotFound(
      TableNames.STIPULATIONS,
      { stipulationId },
      'Stipulation not found'
    );
    if ('notFoundResponse' in stipulationResult) {
      return stipulationResult.notFoundResponse;
    }

    const updateExpr = buildUpdateExpression({
      name: body.name,
      description: body.description,
    });

    if (!updateExpr.hasChanges) {
      return badRequest('No valid fields to update');
    }

    const result = await dynamoDb.update({
      TableName: TableNames.STIPULATIONS,
      Key: { stipulationId },
      UpdateExpression: updateExpr.UpdateExpression,
      ExpressionAttributeNames: updateExpr.ExpressionAttributeNames,
      ExpressionAttributeValues: updateExpr.ExpressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return success(result.Attributes);
  } catch (err) {
    console.error('Error updating stipulation:', err);
    return serverError('Failed to update stipulation');
  }
};
