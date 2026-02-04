import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError, conflict } from '../../lib/response';

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

    if (!event.body) {
      return badRequest('Request body is required');
    }

    const body: UpdateSeasonBody = JSON.parse(event.body);

    // Get existing season
    const existingSeason = await dynamoDb.get({
      TableName: TableNames.SEASONS,
      Key: { seasonId },
    });

    if (!existingSeason.Item) {
      return notFound('Season not found');
    }

    // If trying to activate a season, check if there's already an active one
    if (body.status === 'active' && existingSeason.Item.status !== 'active') {
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

    // Build update expression
    const updateExpressions: string[] = ['updatedAt = :updatedAt'];
    const expressionAttributeValues: Record<string, any> = {
      ':updatedAt': new Date().toISOString(),
    };
    const expressionAttributeNames: Record<string, string> = {};

    if (body.name !== undefined) {
      updateExpressions.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = body.name;
    }

    if (body.endDate !== undefined) {
      updateExpressions.push('endDate = :endDate');
      expressionAttributeValues[':endDate'] = body.endDate;
    }

    if (body.status !== undefined) {
      updateExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = body.status;

      // If ending the season, set endDate if not already set
      if (body.status === 'completed' && !body.endDate && !existingSeason.Item.endDate) {
        updateExpressions.push('endDate = :autoEndDate');
        expressionAttributeValues[':autoEndDate'] = new Date().toISOString();
      }
    }

    const updateParams: any = {
      TableName: TableNames.SEASONS,
      Key: { seasonId },
      UpdateExpression: 'SET ' + updateExpressions.join(', '),
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    };

    if (Object.keys(expressionAttributeNames).length > 0) {
      updateParams.ExpressionAttributeNames = expressionAttributeNames;
    }

    const result = await dynamoDb.update(updateParams);

    return success(result.Attributes);
  } catch (err) {
    console.error('Error updating season:', err);
    return serverError('Failed to update season');
  }
};
