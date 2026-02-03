import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, serverError } from '../../lib/response';

interface CreateDivisionBody {
  name: string;
  description?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    if (!event.body) {
      return badRequest('Request body is required');
    }

    const body: CreateDivisionBody = JSON.parse(event.body);

    if (!body.name) {
      return badRequest('Name is required');
    }

    const timestamp = new Date().toISOString();
    const division: Record<string, any> = {
      divisionId: uuidv4(),
      name: body.name,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    if (body.description) {
      division.description = body.description;
    }

    await dynamoDb.put({
      TableName: TableNames.DIVISIONS,
      Item: division,
    });

    return created(division);
  } catch (err) {
    console.error('Error creating division:', err);
    return serverError('Failed to create division');
  }
};
