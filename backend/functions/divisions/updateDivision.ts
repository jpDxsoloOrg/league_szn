import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { buildUpdateExpression, getOrNotFound } from '../../lib/dynamodbUtils';
import { success, badRequest, serverError } from '../../lib/response';
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

    const divisionResult = await getOrNotFound(TableNames.DIVISIONS, { divisionId }, 'Division not found');
    if ('notFoundResponse' in divisionResult) {
      return divisionResult.notFoundResponse;
    }

    const updateExpr = buildUpdateExpression({
      name: body.name,
      description: body.description,
    });

    if (!updateExpr.hasChanges) {
      return badRequest('No valid fields to update');
    }

    const result = await dynamoDb.update({
      TableName: TableNames.DIVISIONS,
      Key: { divisionId },
      UpdateExpression: updateExpr.UpdateExpression,
      ExpressionAttributeNames: updateExpr.ExpressionAttributeNames,
      ExpressionAttributeValues: updateExpr.ExpressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return success(result.Attributes);
  } catch (err) {
    console.error('Error updating division:', err);
    return serverError('Failed to update division');
  }
};
