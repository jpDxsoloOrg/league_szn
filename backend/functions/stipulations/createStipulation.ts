import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

interface CreateStipulationBody {
  name: string;
  description?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { data: body, error: parseError } = parseBody<CreateStipulationBody>(event);
    if (parseError) return parseError;

    if (!body.name) {
      return badRequest('Name is required');
    }

    const timestamp = new Date().toISOString();
    const stipulation: Record<string, string> = {
      stipulationId: uuidv4(),
      name: body.name,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    if (body.description) {
      stipulation.description = body.description;
    }

    await dynamoDb.put({
      TableName: TableNames.STIPULATIONS,
      Item: stipulation,
    });

    return created(stipulation);
  } catch (err) {
    console.error('Error creating stipulation:', err);
    return serverError('Failed to create stipulation');
  }
};
