import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames, buildUpdateExpression, getOrNotFound } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

interface UpdateShowBody {
  name?: string;
  companyId?: string;
  description?: string;
  schedule?: string;
  dayOfWeek?: string;
  imageUrl?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const showId = event.pathParameters?.showId;

    if (!showId) {
      return badRequest('Show ID is required');
    }

    const { data: body, error: parseError } = parseBody<UpdateShowBody>(event);
    if (parseError) return parseError;

    const showResult = await getOrNotFound(TableNames.SHOWS, { showId }, 'Show not found');
    if ('notFoundResponse' in showResult) {
      return showResult.notFoundResponse;
    }

    // If companyId is being changed, validate the new company exists
    if (body.companyId !== undefined) {
      const companyResult = await dynamoDb.get({
        TableName: TableNames.COMPANIES,
        Key: { companyId: body.companyId },
      });
      if (!companyResult.Item) {
        return notFound(`Company ${body.companyId} not found`);
      }
    }

    const updateExpr = buildUpdateExpression({
      name: body.name,
      companyId: body.companyId,
      description: body.description,
      schedule: body.schedule,
      dayOfWeek: body.dayOfWeek,
      imageUrl: body.imageUrl,
    });

    if (!updateExpr.hasChanges) {
      return badRequest('No valid fields to update');
    }

    const result = await dynamoDb.update({
      TableName: TableNames.SHOWS,
      Key: { showId },
      UpdateExpression: updateExpr.UpdateExpression,
      ExpressionAttributeNames: updateExpr.ExpressionAttributeNames,
      ExpressionAttributeValues: updateExpr.ExpressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return success(result.Attributes);
  } catch (err) {
    console.error('Error updating show:', err);
    return serverError('Failed to update show');
  }
};
