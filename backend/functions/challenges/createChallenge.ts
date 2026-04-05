import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { v4 as uuidv4 } from 'uuid';
import { createNotifications } from '../../lib/notifications';

interface CreateChallengeBody {
  challengedId?: string; // Legacy: single opponent id — preferred: opponentIds[]
  opponentIds?: string[];
  matchType: string;
  stipulation?: string;
  championshipId?: string;
  challengeNote?: string;
  message?: string; // Legacy alias for challengeNote
  challengeMode?: 'singles' | 'tag_team';
  challengedTagTeamId?: string;
}

interface ResponseRecord {
  status: 'pending' | 'accepted' | 'declined';
  declineReason?: string;
}

const MAX_CHALLENGE_NOTE_LENGTH = 200;
const MAX_OPPONENTS = 5;

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
    const { challengedId, opponentIds: inputOpponentIds, matchType, stipulation, championshipId, challengeNote: inputChallengeNote, message, challengeMode, challengedTagTeamId } = body;

    if (!matchType) {
      return badRequest('matchType is required');
    }

    // Prefer challengeNote; fall back to legacy message field
    const challengeNote = inputChallengeNote ?? message;
    if (challengeNote && challengeNote.length > MAX_CHALLENGE_NOTE_LENGTH) {
      return badRequest(`challengeNote must be ${MAX_CHALLENGE_NOTE_LENGTH} characters or less`);
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
        challengeNote: challengeNote || undefined,
        status: 'pending',
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      await dynamoDb.put({
        TableName: TableNames.CHALLENGES,
        Item: challenge,
      });

      // Notify both members of the challenged tag team
      const challengedPlayerIds = [
        challengedTeam.player1Id as string,
        challengedTeam.player2Id as string,
      ];

      const playerResults = await Promise.all(
        challengedPlayerIds.map((pid) =>
          dynamoDb.get({ TableName: TableNames.PLAYERS, Key: { playerId: pid } })
        )
      );

      const challengerTagTeamName = challengerTagTeam.name as string;
      const notifications = playerResults
        .map((result) => result.Item as Record<string, unknown> | undefined)
        .filter((player): player is Record<string, unknown> => !!player?.userId)
        .map((player) => ({
          userId: player.userId as string,
          type: 'challenge_received' as const,
          message: `${challengerTagTeamName} has challenged your tag team to a match!`,
          sourceId: challenge.challengeId,
          sourceType: 'challenge' as const,
        }));

      if (notifications.length > 0) {
        await createNotifications(notifications);
      }

      return created(challenge);
    }

    // --- Singles / Multi-opponent Challenge Flow (default) ---
    // Normalize opponent list: prefer opponentIds[], fall back to legacy challengedId
    const opponentIds: string[] = (inputOpponentIds && inputOpponentIds.length > 0)
      ? Array.from(new Set(inputOpponentIds))
      : (challengedId ? [challengedId] : []);

    if (opponentIds.length === 0) {
      return badRequest('opponentIds is required');
    }
    if (opponentIds.length > MAX_OPPONENTS) {
      return badRequest(`A challenge may target at most ${MAX_OPPONENTS} opponents`);
    }
    if (opponentIds.includes(challengerId)) {
      return badRequest('You cannot challenge yourself');
    }

    // Verify each challenged player exists
    const opponentLookups = await Promise.all(
      opponentIds.map((pid) =>
        dynamoDb.get({ TableName: TableNames.PLAYERS, Key: { playerId: pid } })
      )
    );
    const missing = opponentIds.filter((_, i) => !opponentLookups[i].Item);
    if (missing.length > 0) {
      return badRequest('Challenged player not found');
    }

    const responses: Record<string, ResponseRecord> = Object.fromEntries(
      opponentIds.map((pid) => [pid, { status: 'pending' as const }])
    );

    const challenge = {
      challengeId: uuidv4(),
      challengerId,
      challengedId: opponentIds[0], // preserve for legacy GSI queries
      opponentIds,
      responses,
      challengeMode: 'singles' as const,
      matchType,
      stipulation: stipulation || undefined,
      championshipId: championshipId || undefined,
      challengeNote: challengeNote || undefined,
      status: 'pending',
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await dynamoDb.put({
      TableName: TableNames.CHALLENGES,
      Item: challenge,
    });

    // Notify each challenged player who has a linked user account
    const notifications = opponentLookups
      .map((r) => r.Item as Record<string, unknown> | undefined)
      .filter((p): p is Record<string, unknown> => !!p?.userId)
      .map((p) => ({
        userId: p.userId as string,
        type: 'challenge_received' as const,
        message: `${challengerPlayer.name as string} has challenged you to a match!`,
        sourceId: challenge.challengeId,
        sourceType: 'challenge' as const,
      }));

    if (notifications.length > 0) {
      await createNotifications(notifications);
    }

    return created(challenge);
  } catch (err) {
    console.error('Error creating challenge:', err);
    return serverError('Failed to create challenge');
  }
};
