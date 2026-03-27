import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { v4 as uuidv4 } from 'uuid';

interface CreateTagTeamBody {
  name: string;
  partnerId: string;
  imageUrl?: string;
}

interface PlayerRecord {
  playerId: string;
  name: string;
  tagTeamId?: string;
  userId?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Only wrestlers can create tag teams');
    }

    const { data: body, error: parseError } = parseBody<CreateTagTeamBody>(event);
    if (parseError) return parseError;
    const { name, partnerId, imageUrl } = body;

    if (!name || !partnerId) {
      return badRequest('name and partnerId are required');
    }

    // Find the caller's player record via their user sub
    const callerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': auth.sub },
    });

    const callerPlayer = callerResult.Items?.[0] as PlayerRecord | undefined;
    if (!callerPlayer) {
      return badRequest('No player profile linked to your account');
    }

    // Verify caller doesn't already have a tag team
    if (callerPlayer.tagTeamId) {
      return badRequest('You are already in a tag team');
    }

    // Verify caller is not trying to team with themselves
    if (callerPlayer.playerId === partnerId) {
      return badRequest('You cannot form a tag team with yourself');
    }

    // Verify partner exists
    const partnerResult = await dynamoDb.get({
      TableName: TableNames.PLAYERS,
      Key: { playerId: partnerId },
    });

    const partnerPlayer = partnerResult.Item as PlayerRecord | undefined;
    if (!partnerPlayer) {
      return badRequest('Partner player not found');
    }

    // Verify partner doesn't already have a tag team
    if (partnerPlayer.tagTeamId) {
      return badRequest('Partner is already in a tag team');
    }

    const now = new Date().toISOString();
    const tagTeam = {
      tagTeamId: uuidv4(),
      name,
      player1Id: callerPlayer.playerId,
      player2Id: partnerId,
      imageUrl: imageUrl || undefined,
      status: 'pending_partner',
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: now,
      updatedAt: now,
    };

    await dynamoDb.put({
      TableName: TableNames.TAG_TEAMS,
      Item: tagTeam,
    });

    return created(tagTeam);
  } catch (err) {
    console.error('Error creating tag team:', err);
    return serverError('Failed to create tag team');
  }
};
