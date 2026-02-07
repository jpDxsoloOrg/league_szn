import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, serverError } from '../../lib/response';

interface CreateChampionshipBody {
  name: string;
  type: 'singles' | 'tag';
  currentChampion?: string | string[];
  divisionId?: string;
  imageUrl?: string;
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

    const championship: Record<string, any> = {
      championshipId: uuidv4(),
      name: body.name,
      type: body.type,
      currentChampion: body.currentChampion,
      createdAt: new Date().toISOString(),
      isActive: true,
    };

    // Add divisionId if provided
    if (body.divisionId) {
      championship.divisionId = body.divisionId;
    }

    // Add imageUrl if provided
    if (body.imageUrl) {
      championship.imageUrl = body.imageUrl;
    }

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
