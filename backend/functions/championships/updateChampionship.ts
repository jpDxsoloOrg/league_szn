import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { buildUpdateExpression, getOrNotFound } from '../../lib/dynamodbUtils';
import { success, badRequest, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const championshipId = event.pathParameters?.championshipId;

    if (!championshipId) {
      return badRequest('Championship ID is required');
    }

    const { data: body, error: parseError } = parseBody(event);
    if (parseError) return parseError;

    const championshipResult = await getOrNotFound(
      TableNames.CHAMPIONSHIPS,
      { championshipId },
      'Championship not found'
    );
    if ('notFoundResponse' in championshipResult) {
      return championshipResult.notFoundResponse;
    }

    const updateExpr = buildUpdateExpression({
      name: body.name,
      type: body.type,
      imageUrl: body.imageUrl,
      isActive: body.isActive,
      currentChampion: body.currentChampion,
      divisionId: body.divisionId,
    });

    if (!updateExpr.hasChanges) {
      return badRequest('No valid fields to update');
    }

    const result = await dynamoDb.update({
      TableName: TableNames.CHAMPIONSHIPS,
      Key: { championshipId },
      UpdateExpression: updateExpr.UpdateExpression,
      ExpressionAttributeNames: updateExpr.ExpressionAttributeNames,
      ExpressionAttributeValues: updateExpr.ExpressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return success(result.Attributes);
  } catch (err) {
    console.error('Error updating championship:', err);
    return serverError('Failed to update championship');
  }
};
