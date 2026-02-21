import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuid } from 'uuid';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { parseBody } from '../../lib/parseBody';
import { created, badRequest, notFound, serverError } from '../../lib/response';

interface CreateAwardBody {
  name: string;
  playerId: string;
  description?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const seasonId = event.pathParameters?.seasonId;
    if (!seasonId) {
      return badRequest('Season ID is required');
    }

    const { data: body, error: parseError } = parseBody<CreateAwardBody>(event);
    if (parseError) return parseError;

    if (!body.name) {
      return badRequest('name is required');
    }
    if (!body.playerId) {
      return badRequest('playerId is required');
    }

    // Verify season exists
    const seasonResult = await dynamoDb.get({
      TableName: TableNames.SEASONS,
      Key: { seasonId },
    });
    if (!seasonResult.Item) {
      return notFound('Season not found');
    }

    // Verify player exists
    const playerResult = await dynamoDb.get({
      TableName: TableNames.PLAYERS,
      Key: { playerId: body.playerId },
    });
    if (!playerResult.Item) {
      return notFound('Player not found');
    }

    const now = new Date().toISOString();
    const item = {
      awardId: uuid(),
      seasonId,
      name: body.name,
      awardType: 'custom' as const,
      playerId: body.playerId,
      playerName: (playerResult.Item as { name: string }).name,
      description: body.description || null,
      createdAt: now,
    };

    await dynamoDb.put({
      TableName: TableNames.SEASON_AWARDS,
      Item: item,
    });

    return created(item);
  } catch (err) {
    console.error('Error creating season award:', err);
    return serverError('Failed to create season award');
  }
};
