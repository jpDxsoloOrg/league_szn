import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { v4 as uuidv4 } from 'uuid';
// Notifications intentionally not dispatched here while the challenge UI is hidden.

interface CreateChallengeBody {
  challengedId: string;
  matchType: string;
  stipulation?: string;
  championshipId?: string;
  message?: string;
  challengeMode?: 'singles' | 'tag_team';
  challengedTagTeamId?: string;
}

async function findPlayerActiveTagTeam(playerId: string): Promise<Record<string, unknown> | null> {
  const [player1Result, player2Result] = await Promise.all([
    dynamoDb.query({
      TableName: TableNames.TAG_TEAMS,
      IndexName: 'Player1Index',
      KeyConditionExpression: 'player1Id = :pid',
      FilterExpression: '#s = :active',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':pid': playerId, ':active': 'active' },
    }),
    dynamoDb.query({
      TableName: TableNames.TAG_TEAMS,
      IndexName: 'Player2Index',
      KeyConditionExpression: 'player2Id = :pid',
      FilterExpression: '#s = :active',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':pid': playerId, ':active': 'active' },
    }),
  ]);

  const match = player1Result.Items?.[0] || player2Result.Items?.[0];
  return match ? (match as Record<string, unknown>) : null;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Only wrestlers can issue challenges');
    }

    const { data: body, error: parseError } = parseBody<CreateChallengeBody>(event);
    if (parseError) return parseError;
    const { challengedId, matchType, stipulation, championshipId, message, challengeMode, challengedTagTeamId } = body;

    if (!matchType) {
      return badRequest('matchType is required');
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

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiration

    if (challengeMode === 'tag_team') {
      // --- Tag Team Challenge Flow ---
      if (!challengedTagTeamId) {
        return badRequest('challengedTagTeamId is required for tag team challenges');
      }

      const challengerTagTeam = await findPlayerActiveTagTeam(challengerId);
      if (!challengerTagTeam) {
        return badRequest('You are not in an active tag team');
      }

      const challengedTagTeamResult = await dynamoDb.get({
        TableName: TableNames.TAG_TEAMS,
        Key: { tagTeamId: challengedTagTeamId },
      });

      if (!challengedTagTeamResult.Item) {
        return badRequest('Challenged tag team not found');
      }

      const challengedTeam = challengedTagTeamResult.Item as Record<string, unknown>;

      if (challengedTeam.status !== 'active') {
        return badRequest('Challenged tag team is not active');
      }

      if ((challengerTagTeam.tagTeamId as string) === challengedTagTeamId) {
        return badRequest('A tag team cannot challenge itself');
      }

      const challenge = {
        challengeId: uuidv4(),
        challengerId,
        challengedId: challengedTeam.player1Id as string,
        challengeMode: 'tag_team' as const,
        challengerTagTeamId: challengerTagTeam.tagTeamId as string,
        challengedTagTeamId,
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

      // Notification dispatch intentionally disabled while the challenge UI is hidden.
      // The challenge row is still persisted so direct API calls keep working.
      return created(challenge);
    }

    // --- Singles Challenge Flow (default) ---
    if (!challengedId) {
      return badRequest('challengedId is required');
    }

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

    const challenge = {
      challengeId: uuidv4(),
      challengerId,
      challengedId,
      challengeMode: 'singles' as const,
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

    // Notification dispatch intentionally disabled while the challenge UI is hidden.
    return created(challenge);
  } catch (err) {
    console.error('Error creating challenge:', err);
    return serverError('Failed to create challenge');
  }
};
