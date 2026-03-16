import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const result = await dynamoDb.scan({
      TableName: TableNames.COMPANIES,
    });

    const companies = (result.Items || []) as Record<string, unknown>[];

    // Sort by name ascending
    companies.sort((a, b) => {
      const nameA = (a.name as string) || '';
      const nameB = (b.name as string) || '';
      return nameA.localeCompare(nameB);
    });

    return success(companies);
  } catch (err) {
    console.error('Error fetching companies:', err);
    return serverError('Failed to fetch companies');
  }
};
