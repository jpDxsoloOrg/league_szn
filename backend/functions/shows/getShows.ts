import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const companyId = event.queryStringParameters?.companyId;

    let shows: Record<string, unknown>[];

    if (companyId) {
      // Query CompanyShowsIndex for shows belonging to a specific company
      const result = await dynamoDb.query({
        TableName: TableNames.SHOWS,
        IndexName: 'CompanyShowsIndex',
        KeyConditionExpression: '#companyId = :companyId',
        ExpressionAttributeNames: { '#companyId': 'companyId' },
        ExpressionAttributeValues: { ':companyId': companyId },
      });
      shows = (result.Items || []) as Record<string, unknown>[];
    } else {
      // Scan all shows
      const result = await dynamoDb.scan({
        TableName: TableNames.SHOWS,
      });
      shows = (result.Items || []) as Record<string, unknown>[];
    }

    // Sort by name ascending
    shows.sort((a, b) => {
      const nameA = (a.name as string) || '';
      const nameB = (b.name as string) || '';
      return nameA.localeCompare(nameB);
    });

    return success(shows);
  } catch (err) {
    console.error('Error fetching shows:', err);
    return serverError('Failed to fetch shows');
  }
};
