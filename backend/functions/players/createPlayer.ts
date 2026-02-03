import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, serverError } from '../../lib/response';

interface CreatePlayerBody {
  name: string;
  currentWrestler: string;
  imageUrl?: string;
  divisionId?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    if (!event.body) {
      return badRequest('Request body is required');
    }

    const body: CreatePlayerBody = JSON.parse(event.body);

    if (!body.name || !body.currentWrestler) {
      return badRequest('Name and currentWrestler are required');
    }

    const timestamp = new Date().toISOString();
    const player: Record<string, any> = {
      playerId: uuidv4(),
      name: body.name,
      currentWrestler: body.currentWrestler,
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    // Add imageUrl if provided
    if (body.imageUrl) {
      player.imageUrl = body.imageUrl;
    }

    // Add divisionId if provided
    if (body.divisionId) {
      player.divisionId = body.divisionId;
    }

    await dynamoDb.put({
      TableName: TableNames.PLAYERS,
      Item: player,
    });

    return created(player);
  } catch (err) {
    console.error('Error creating player:', err);
    return serverError('Failed to create player');
  }
};
