import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const championshipId = event.pathParameters?.championshipId;

    if (!championshipId) {
      return badRequest('Championship ID is required');
    }

    const result = await dynamoDb.query({
      TableName: TableNames.CHAMPIONSHIP_HISTORY,
      KeyConditionExpression: 'championshipId = :championshipId',
      ExpressionAttributeValues: { ':championshipId': championshipId },
      ScanIndexForward: false, // Sort by wonDate descending (most recent first)
    });

    return success(result.Items || []);
  } catch (err) {
    console.error('Error fetching championship history:', err);
    return serverError('Failed to fetch championship history');
  }
};
