import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, serverError } from '../../lib/response';

interface CreateChampionshipBody {
  name: string;
  type: 'singles' | 'tag';
  currentChampion?: string | string[];
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    if (!event.body) {
      return badRequest('Request body is required');
    }

    const body: CreateChampionshipBody = JSON.parse(event.body);

    if (!body.name || !body.type) {
      return badRequest('Name and type are required');
    }

    if (!['singles', 'tag'].includes(body.type)) {
      return badRequest('Type must be either "singles" or "tag"');
    }

    const championship = {
      championshipId: uuidv4(),
      name: body.name,
      type: body.type,
      currentChampion: body.currentChampion,
      createdAt: new Date().toISOString(),
      isActive: true,
    };

    await dynamoDb.put({
      TableName: TableNames.CHAMPIONSHIPS,
      Item: championship,
    });

    return created(championship);
  } catch (err) {
    console.error('Error creating championship:', err);
    return serverError('Failed to create championship');
  }
};
