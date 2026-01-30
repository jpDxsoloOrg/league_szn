import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const tournamentId = event.pathParameters?.tournamentId;

    if (!tournamentId) {
      return badRequest('Tournament ID is required');
    }

    if (!event.body) {
      return badRequest('Request body is required');
    }

    const body = JSON.parse(event.body);

    // Check if tournament exists
    const existing = await dynamoDb.get({
      TableName: TableNames.TOURNAMENTS,
      Key: { tournamentId },
    });

    if (!existing.Item) {
      return notFound('Tournament not found');
    }

    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (body.status !== undefined) {
      updateExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = body.status;
    }

    if (body.winner !== undefined) {
      updateExpressions.push('#winner = :winner');
      expressionAttributeNames['#winner'] = 'winner';
      expressionAttributeValues[':winner'] = body.winner;
    }

    if (body.brackets !== undefined) {
      updateExpressions.push('#brackets = :brackets');
      expressionAttributeNames['#brackets'] = 'brackets';
      expressionAttributeValues[':brackets'] = body.brackets;
    }

    if (body.standings !== undefined) {
      updateExpressions.push('#standings = :standings');
      expressionAttributeNames['#standings'] = 'standings';
      expressionAttributeValues[':standings'] = body.standings;
    }

    if (updateExpressions.length === 0) {
      return badRequest('No valid fields to update');
    }

    const result = await dynamoDb.update({
      TableName: TableNames.TOURNAMENTS,
      Key: { tournamentId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return success(result.Attributes);
  } catch (err) {
    console.error('Error updating tournament:', err);
    return serverError('Failed to update tournament');
  }
};
