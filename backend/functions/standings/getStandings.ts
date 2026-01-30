import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const result = await dynamoDb.scan({
      TableName: TableNames.PLAYERS,
    });

    // Sort players by wins descending, then by losses ascending
    const players = (result.Items || []).sort((a, b) => {
      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }
      return a.losses - b.losses;
    });

    return success({
      players,
      sortedByWins: true,
    });
  } catch (err) {
    console.error('Error fetching standings:', err);
    return serverError('Failed to fetch standings');
  }
};
