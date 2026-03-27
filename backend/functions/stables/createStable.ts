import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { v4 as uuidv4 } from 'uuid';

interface CreateStableBody {
  name: string;
  imageUrl?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Only wrestlers can create stables');
    }

    const { data: body, error: parseError } = parseBody<CreateStableBody>(event);
    if (parseError) return parseError;

    const { name, imageUrl } = body;

    if (!name || !name.trim()) {
      return badRequest('Stable name is required');
    }

    // Find the player record via auth.sub
    const playerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': auth.sub },
    });

    const player = playerResult.Items?.[0];
    if (!player) {
      return badRequest('No player profile linked to your account');
    }

    const playerId = player.playerId as string;

    // Check player doesn't already belong to a stable
    if (player.stableId) {
      return badRequest('You already belong to a stable');
    }

    const now = new Date().toISOString();
    const stable = {
      stableId: uuidv4(),
      name: name.trim(),
      leaderId: playerId,
      memberIds: [playerId],
      status: 'pending',
      imageUrl: imageUrl || undefined,
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: now,
      updatedAt: now,
    };

    await dynamoDb.put({
      TableName: TableNames.STABLES,
      Item: stable,
    });

    return created(stable);
  } catch (err) {
    console.error('Error creating stable:', err);
    return serverError('Failed to create stable');
  }
};
