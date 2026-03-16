import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames, buildUpdateExpression, getOrNotFound } from '../../lib/dynamodb';
import { success, badRequest, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

interface UpdateCompanyBody {
  name?: string;
  abbreviation?: string;
  imageUrl?: string;
  description?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const companyId = event.pathParameters?.companyId;

    if (!companyId) {
      return badRequest('Company ID is required');
    }

    const { data: body, error: parseError } = parseBody<UpdateCompanyBody>(event);
    if (parseError) return parseError;

    const companyResult = await getOrNotFound(TableNames.COMPANIES, { companyId }, 'Company not found');
    if ('notFoundResponse' in companyResult) {
      return companyResult.notFoundResponse;
    }

    const updateExpr = buildUpdateExpression({
      name: body.name,
      abbreviation: body.abbreviation,
      imageUrl: body.imageUrl,
      description: body.description,
    });

    if (!updateExpr.hasChanges) {
      return badRequest('No valid fields to update');
    }

    const result = await dynamoDb.update({
      TableName: TableNames.COMPANIES,
      Key: { companyId },
      UpdateExpression: updateExpr.UpdateExpression,
      ExpressionAttributeNames: updateExpr.ExpressionAttributeNames,
      ExpressionAttributeValues: updateExpr.ExpressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return success(result.Attributes);
  } catch (err) {
    console.error('Error updating company:', err);
    return serverError('Failed to update company');
  }
};
