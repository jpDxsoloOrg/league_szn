import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const companyId = event.pathParameters?.companyId;

    if (!companyId) {
      return badRequest('Company ID is required');
    }

    const result = await dynamoDb.get({
      TableName: TableNames.COMPANIES,
      Key: { companyId },
    });

    if (!result.Item) {
      return notFound('Company not found');
    }

    return success(result.Item);
  } catch (err) {
    console.error('Error fetching company:', err);
    return serverError('Failed to fetch company');
  }
};
