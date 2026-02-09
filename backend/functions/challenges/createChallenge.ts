import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { v4 as uuidv4 } from 'uuid';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Only wrestlers can issue challenges');
    }

    const body = JSON.parse(event.body || '{}');
    const { challengedId, matchType, stipulation, championshipId, message } = body;

    if (!challengedId || !matchType) {
      return badRequest('challengedId and matchType are required');
    }

    // Find the challenger's player record via their user sub
    const playerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': auth.sub },
    });

    const challengerPlayer = playerResult.Items?.[0];
    if (!challengerPlayer) {
      return badRequest('No player profile linked to your account');
    }

    const challengerId = challengerPlayer.playerId as string;

    if (challengerId === challengedId) {
      return badRequest('You cannot challenge yourself');
    }

    // Verify the challenged player exists
    const challengedResult = await dynamoDb.get({
      TableName: TableNames.PLAYERS,
      Key: { playerId: challengedId },
    });
    if (!challengedResult.Item) {
      return badRequest('Challenged player not found');
    }

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiration

    const challenge = {
      challengeId: uuidv4(),
      challengerId,
      challengedId,
      matchType,
      stipulation: stipulation || undefined,
      championshipId: championshipId || undefined,
      message: message || undefined,
      status: 'pending',
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await dynamoDb.put({
      TableName: TableNames.CHALLENGES,
      Item: challenge,
    });

    return created(challenge);
  } catch (err) {
    console.error('Error creating challenge:', err);
    return serverError('Failed to create challenge');
  }
};
