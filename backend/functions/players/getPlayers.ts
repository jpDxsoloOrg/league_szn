import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const result = await dynamoDb.scan({
      TableName: TableNames.PLAYERS,
    });

    // Only include players who have a wrestler assigned (exclude Fantasy-only users)
    const wrestlers = (result.Items || []).filter((p) => p.currentWrestler);

    return success(wrestlers);
  } catch (err) {
    console.error('Error fetching players:', err);
    return serverError('Failed to fetch players');
  }
};
