import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

interface CreateMatchTypeBody {
  name: string;
  description?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { data: body, error: parseError } = parseBody<CreateMatchTypeBody>(event);
    if (parseError) return parseError;

    if (!body.name) {
      return badRequest('Name is required');
    }

    const timestamp = new Date().toISOString();
    const matchType: Record<string, string> = {
      matchTypeId: uuidv4(),
      name: body.name,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    if (body.description) {
      matchType.description = body.description;
    }

    await dynamoDb.put({
      TableName: TableNames.MATCH_TYPES,
      Item: matchType,
    });

    return created(matchType);
  } catch (err) {
    console.error('Error creating match type:', err);
    return serverError('Failed to create match type');
  }
};
