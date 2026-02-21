import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { buildUpdateExpression, getOrNotFound } from '../../lib/dynamodbUtils';
import { success, badRequest, serverError, conflict } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

interface UpdateSeasonBody {
  name?: string;
  endDate?: string;
  status?: 'active' | 'completed';
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const seasonId = event.pathParameters?.seasonId;

    if (!seasonId) {
      return badRequest('Season ID is required');
    }

    const { data: body, error: parseError } = parseBody<UpdateSeasonBody>(event);
    if (parseError) return parseError;

    const seasonResult = await getOrNotFound(TableNames.SEASONS, { seasonId }, 'Season not found');
    if ('notFoundResponse' in seasonResult) {
      return seasonResult.notFoundResponse;
    }
    const existingSeason = seasonResult.item;

    // If trying to activate a season, check if there's already an active one
    if (body.status === 'active' && existingSeason.status !== 'active') {
      const activeSeasons = await dynamoDb.scan({
        TableName: TableNames.SEASONS,
        FilterExpression: '#status = :active AND seasonId <> :seasonId',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':active': 'active',
          ':seasonId': seasonId,
        },
      });

      if (activeSeasons.Items && activeSeasons.Items.length > 0) {
        return conflict('There is already an active season. Please end the current season first.');
      }
    }

    const baseExpr = buildUpdateExpression(
      {
        name: body.name,
        status: body.status,
      },
      { includeUpdatedAt: false }
    );

    const setExpressions: string[] = [];
    const expressionAttributeValues: Record<string, unknown> = {
      ...(baseExpr.ExpressionAttributeValues || {}),
      ':updatedAt': new Date().toISOString(),
    };
    const expressionAttributeNames: Record<string, string> = {
      ...(baseExpr.ExpressionAttributeNames || {}),
    };

    if (baseExpr.UpdateExpression.startsWith('SET ')) {
      setExpressions.push(baseExpr.UpdateExpression.slice(4));
    }

    if (body.endDate !== undefined) {
      setExpressions.push('endDate = :endDate');
      expressionAttributeValues[':endDate'] = body.endDate;
    }

    // If ending the season, set endDate if not already set
    if (body.status === 'completed' && !body.endDate && !existingSeason.endDate) {
      setExpressions.push('endDate = :autoEndDate');
      expressionAttributeValues[':autoEndDate'] = new Date().toISOString();
    }

    setExpressions.push('updatedAt = :updatedAt');

    if (setExpressions.length === 1) {
      return badRequest('No valid fields to update');
    }

    const result = await dynamoDb.update({
      TableName: TableNames.SEASONS,
      Key: { seasonId },
      UpdateExpression: `SET ${setExpressions.join(', ')}`,
      ExpressionAttributeNames:
        Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return success(result.Attributes);
  } catch (err) {
    console.error('Error updating season:', err);
    return serverError('Failed to update season');
  }
};
