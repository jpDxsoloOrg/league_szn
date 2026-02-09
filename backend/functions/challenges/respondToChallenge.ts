import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError, forbidden } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { v4 as uuidv4 } from 'uuid';

type ChallengeAction = 'accept' | 'decline' | 'counter';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can respond to challenges');
    }

    const challengeId = event.pathParameters?.challengeId;
    if (!challengeId) {
      return badRequest('challengeId is required');
    }

    const body = JSON.parse(event.body || '{}');
    const { action, responseMessage, counterMatchType, counterStipulation, counterMessage } = body as {
      action: ChallengeAction;
      responseMessage?: string;
      counterMatchType?: string;
      counterStipulation?: string;
      counterMessage?: string;
    };

    if (!action || !['accept', 'decline', 'counter'].includes(action)) {
      return badRequest('action must be accept, decline, or counter');
    }

    // Get the challenge
    const result = await dynamoDb.get({
      TableName: TableNames.CHALLENGES,
      Key: { challengeId },
    });
    const challenge = result.Item;
    if (!challenge) {
      return notFound('Challenge not found');
    }

    if (challenge.status !== 'pending') {
      return badRequest('Challenge is no longer pending');
    }

    // Verify the responder is the challenged player
    const playerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': auth.sub },
    });
    const responderPlayer = playerResult.Items?.[0];
    if (!responderPlayer || responderPlayer.playerId !== challenge.challengedId) {
      return forbidden('Only the challenged player can respond');
    }

    const now = new Date().toISOString();

    if (action === 'accept') {
      await dynamoDb.update({
        TableName: TableNames.CHALLENGES,
        Key: { challengeId },
        UpdateExpression: 'SET #s = :status, responseMessage = :rm, updatedAt = :now',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':status': 'accepted',
          ':rm': responseMessage || undefined,
          ':now': now,
        },
      });

      return success({ ...challenge, status: 'accepted', responseMessage, updatedAt: now });
    }

    if (action === 'decline') {
      await dynamoDb.update({
        TableName: TableNames.CHALLENGES,
        Key: { challengeId },
        UpdateExpression: 'SET #s = :status, responseMessage = :rm, updatedAt = :now',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':status': 'declined',
          ':rm': responseMessage || undefined,
          ':now': now,
        },
      });

      return success({ ...challenge, status: 'declined', responseMessage, updatedAt: now });
    }

    // Counter
    if (!counterMatchType) {
      return badRequest('counterMatchType is required when countering');
    }

    const counterChallengeId = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const counterChallenge = {
      challengeId: counterChallengeId,
      challengerId: challenge.challengedId as string,
      challengedId: challenge.challengerId as string,
      matchType: counterMatchType,
      stipulation: counterStipulation || undefined,
      message: counterMessage || undefined,
      status: 'pending',
      expiresAt: expiresAt.toISOString(),
      createdAt: now,
      updatedAt: now,
    };

    // Update original + create counter in transaction
    await dynamoDb.transactWrite({
      TransactItems: [
        {
          Update: {
            TableName: TableNames.CHALLENGES,
            Key: { challengeId },
            UpdateExpression: 'SET #s = :status, responseMessage = :rm, counteredChallengeId = :ccid, updatedAt = :now',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: {
              ':status': 'countered',
              ':rm': responseMessage || undefined,
              ':ccid': counterChallengeId,
              ':now': now,
            },
          },
        },
        {
          Put: {
            TableName: TableNames.CHALLENGES,
            Item: counterChallenge,
          },
        },
      ],
    });

    return success({
      original: { ...challenge, status: 'countered', responseMessage, counteredChallengeId: counterChallengeId, updatedAt: now },
      counter: counterChallenge,
    });
  } catch (err) {
    console.error('Error responding to challenge:', err);
    return serverError('Failed to respond to challenge');
  }
};
