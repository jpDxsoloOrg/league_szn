import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { buildUpdateExpression, getOrNotFound } from '../../lib/dynamodbUtils';
import { success, badRequest, serverError } from '../../lib/response';
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

    const matchTypeResult = await getOrNotFound(
      TableNames.MATCH_TYPES,
      { matchTypeId },
      'Match type not found'
    );
    if ('notFoundResponse' in matchTypeResult) {
      return matchTypeResult.notFoundResponse;
    }

    const updateExpr = buildUpdateExpression({
      name: body.name,
      description: body.description,
    });

    if (!updateExpr.hasChanges) {
      return badRequest('No valid fields to update');
    }

    const result = await dynamoDb.update({
      TableName: TableNames.MATCH_TYPES,
      Key: { matchTypeId },
      UpdateExpression: updateExpr.UpdateExpression,
      ExpressionAttributeNames: updateExpr.ExpressionAttributeNames,
      ExpressionAttributeValues: updateExpr.ExpressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return success(result.Attributes);
  } catch (err) {
    console.error('Error updating match type:', err);
    return serverError('Failed to update match type');
  }
};
