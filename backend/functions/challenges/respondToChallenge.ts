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

    if (!event.body) {
      return badRequest('Request body is required');
    }

    let body;
    try {
      body = JSON.parse(event.body);
    } catch {
      return badRequest('Invalid JSON in request body');
    }

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

    // Verify the responder is allowed to respond
    const playerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': auth.sub },
    });
    const responderPlayer = playerResult.Items?.[0];
    if (!responderPlayer) {
      return forbidden('Only the challenged player can respond');
    }

    if (challenge.challengeMode === 'tag_team') {
      // Tag team challenge: either member of the challenged tag team can respond
      const tagTeamResult = await dynamoDb.get({
        TableName: TableNames.TAG_TEAMS,
        Key: { tagTeamId: challenge.challengedTagTeamId as string },
      });
      const tagTeam = tagTeamResult.Item;
      if (!tagTeam || tagTeam.status !== 'active') {
        return badRequest('The challenged tag team has been dissolved');
      }
      if (responderPlayer.playerId !== tagTeam.player1Id && responderPlayer.playerId !== tagTeam.player2Id) {
        return forbidden('Only members of the challenged tag team can respond');
      }
    } else {
      // Singles challenge: only the challenged player can respond
      if (responderPlayer.playerId !== challenge.challengedId) {
        return forbidden('Only the challenged player can respond');
      }
    }

    const now = new Date().toISOString();

    if (action === 'accept' || action === 'decline') {
      const newStatus = action === 'accept' ? 'accepted' : 'declined';
      const updateExpression = responseMessage
        ? 'SET #s = :status, responseMessage = :rm, updatedAt = :now'
        : 'SET #s = :status, updatedAt = :now';
      const expressionValues: Record<string, unknown> = {
        ':status': newStatus,
        ':now': now,
      };
      if (responseMessage) expressionValues[':rm'] = responseMessage;

      await dynamoDb.update({
        TableName: TableNames.CHALLENGES,
        Key: { challengeId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: expressionValues,
      });

      return success({ ...challenge, status: newStatus, responseMessage, updatedAt: now });
    }

    // Counter
    if (!counterMatchType) {
      return badRequest('counterMatchType is required when countering');
    }

    const counterChallengeId = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const counterChallenge: Record<string, unknown> = {
      challengeId: counterChallengeId,
      challengerId: responderPlayer.playerId as string,
      challengedId: challenge.challengerId as string,
      matchType: counterMatchType,
      status: 'pending',
      expiresAt: expiresAt.toISOString(),
      createdAt: now,
      updatedAt: now,
    };
    if (challenge.challengeMode === 'tag_team') {
      counterChallenge.challengeMode = 'tag_team';
      counterChallenge.challengerTagTeamId = challenge.challengedTagTeamId;
      counterChallenge.challengedTagTeamId = challenge.challengerTagTeamId;
    }
    if (counterStipulation) counterChallenge.stipulation = counterStipulation;
    if (counterMessage) counterChallenge.message = counterMessage;

    // Update original + create counter in transaction
    const counterUpdateExpr = responseMessage
      ? 'SET #s = :status, responseMessage = :rm, counteredChallengeId = :ccid, updatedAt = :now'
      : 'SET #s = :status, counteredChallengeId = :ccid, updatedAt = :now';
    const counterExprValues: Record<string, unknown> = {
      ':status': 'countered',
      ':ccid': counterChallengeId,
      ':now': now,
    };
    if (responseMessage) counterExprValues[':rm'] = responseMessage;

    await dynamoDb.transactWrite({
      TransactItems: [
        {
          Update: {
            TableName: TableNames.CHALLENGES,
            Key: { challengeId },
            UpdateExpression: counterUpdateExpr,
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: counterExprValues,
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
