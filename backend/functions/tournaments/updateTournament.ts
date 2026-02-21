import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { buildUpdateExpression, getOrNotFound } from '../../lib/dynamodbUtils';
import { success, badRequest, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const tournamentId = event.pathParameters?.tournamentId;

    if (!tournamentId) {
      return badRequest('Tournament ID is required');
    }

    const { data: body, error: parseError } = parseBody(event);
    if (parseError) return parseError;

    const tournamentResult = await getOrNotFound(
      TableNames.TOURNAMENTS,
      { tournamentId },
      'Tournament not found'
    );
    if ('notFoundResponse' in tournamentResult) {
      return tournamentResult.notFoundResponse;
    }

    const updateExpr = buildUpdateExpression({
      status: body.status,
      winner: body.winner,
      brackets: body.brackets,
      standings: body.standings,
    });

    if (!updateExpr.hasChanges) {
      return badRequest('No valid fields to update');
    }

    const result = await dynamoDb.update({
      TableName: TableNames.TOURNAMENTS,
      Key: { tournamentId },
      UpdateExpression: updateExpr.UpdateExpression,
      ExpressionAttributeNames: updateExpr.ExpressionAttributeNames,
      ExpressionAttributeValues: updateExpr.ExpressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return success(result.Attributes);
  } catch (err) {
    console.error('Error updating tournament:', err);
    return serverError('Failed to update tournament');
  }
};
