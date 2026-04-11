import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import {
  success,
  badRequest,
  notFound,
  forbidden,
  serverError,
} from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { createNotifications, CreateNotificationParams } from '../../lib/notifications';
import {
  scheduleMatchInternal,
  ScheduleMatchError,
  ScheduleMatchInput,
} from '../matches/scheduleMatch';

type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired';

interface InvitationRow {
  invitationId: string;
  fromPlayerId: string;
  toPlayerId: string;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
  updatedAt?: string;
  acceptedAt?: string;
  matchFormat?: string;
  stipulationId?: string;
  [key: string]: unknown;
}

interface PlayerRecord {
  playerId: string;
  name?: string;
  currentWrestler?: string;
  userId?: string;
  [key: string]: unknown;
}

interface ConditionalCheckFailed extends Error {
  name: 'ConditionalCheckFailedException';
}

function isConditionalCheckFailed(err: unknown): err is ConditionalCheckFailed {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: string }).name === 'ConditionalCheckFailedException'
  );
}

function displayName(player: PlayerRecord | undefined): string {
  if (!player) return 'your opponent';
  return player.currentWrestler || player.name || 'your opponent';
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can accept match invitations');
    }

    // Find the caller's player record via their user sub
    const playerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': auth.sub },
    });

    const callerPlayer = playerResult.Items?.[0] as PlayerRecord | undefined;
    if (!callerPlayer) {
      return badRequest('No player profile linked to your account');
    }

    const invitationId = event.pathParameters?.invitationId;
    if (!invitationId) {
      return badRequest('invitationId is required');
    }

    const invitationResult = await dynamoDb.get({
      TableName: TableNames.MATCH_INVITATIONS,
      Key: { invitationId },
    });

    if (!invitationResult.Item) {
      return notFound('Match invitation not found');
    }

    const invitation = invitationResult.Item as InvitationRow;

    if (invitation.toPlayerId !== callerPlayer.playerId) {
      return forbidden('Only the recipient can accept');
    }

    if (invitation.status !== 'pending') {
      return badRequest('Invitation is no longer pending');
    }

    const nowIso = new Date().toISOString();

    if (!(invitation.expiresAt > nowIso)) {
      return badRequest('Invitation expired');
    }

    // Conditionally mark the invitation as accepted
    let updatedInvitation: InvitationRow;
    try {
      const updateResult = await dynamoDb.update({
        TableName: TableNames.MATCH_INVITATIONS,
        Key: { invitationId },
        UpdateExpression: 'SET #s = :accepted, acceptedAt = :now, updatedAt = :now',
        ConditionExpression: '#s = :pending',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':accepted': 'accepted',
          ':pending': 'pending',
          ':now': nowIso,
        },
        ReturnValues: 'ALL_NEW',
      });
      updatedInvitation = (updateResult.Attributes as InvitationRow | undefined) ?? {
        ...invitation,
        status: 'accepted',
        acceptedAt: nowIso,
        updatedAt: nowIso,
      };
    } catch (err: unknown) {
      if (isConditionalCheckFailed(err)) {
        return badRequest('Invitation already actioned');
      }
      throw err;
    }

    // Schedule the match
    const scheduleInput: ScheduleMatchInput = {
      participants: [invitation.fromPlayerId, invitation.toPlayerId],
      date: nowIso,
      isChampionship: false,
      matchFormat: invitation.matchFormat ?? 'singles',
    };
    if (invitation.stipulationId) {
      scheduleInput.stipulationId = invitation.stipulationId;
    }

    let matchId: string;
    try {
      const scheduled = await scheduleMatchInternal(scheduleInput);
      matchId = scheduled.matchId;
    } catch (scheduleErr: unknown) {
      if (scheduleErr instanceof ScheduleMatchError) {
        if (scheduleErr.statusCode === 404) {
          return notFound(scheduleErr.message);
        }
        return badRequest(scheduleErr.message);
      }
      throw scheduleErr;
    }

    // Fetch both players to notify them
    const [fromPlayerResult, toPlayerResult] = await Promise.all([
      dynamoDb.get({
        TableName: TableNames.PLAYERS,
        Key: { playerId: invitation.fromPlayerId },
      }),
      dynamoDb.get({
        TableName: TableNames.PLAYERS,
        Key: { playerId: invitation.toPlayerId },
      }),
    ]);

    const fromPlayer = fromPlayerResult.Item as PlayerRecord | undefined;
    const toPlayer = toPlayerResult.Item as PlayerRecord | undefined;

    const notifications: CreateNotificationParams[] = [];
    if (fromPlayer?.userId) {
      notifications.push({
        userId: fromPlayer.userId,
        type: 'match_scheduled',
        message: `Match scheduled with ${displayName(toPlayer)}`,
        sourceId: matchId,
        sourceType: 'match',
      });
    }
    if (toPlayer?.userId) {
      notifications.push({
        userId: toPlayer.userId,
        type: 'match_scheduled',
        message: `Match scheduled with ${displayName(fromPlayer)}`,
        sourceId: matchId,
        sourceType: 'match',
      });
    }

    if (notifications.length > 0) {
      await createNotifications(notifications);
    }

    // Best-effort cleanup: remove both players from the matchmaking queue
    await Promise.all(
      [invitation.fromPlayerId, invitation.toPlayerId].map(async (pid) => {
        try {
          await dynamoDb.delete({
            TableName: TableNames.MATCHMAKING_QUEUE,
            Key: { playerId: pid },
          });
        } catch (cleanupErr: unknown) {
          console.error(
            `Failed to remove player ${pid} from matchmaking queue:`,
            cleanupErr
          );
        }
      })
    );

    return success({ matchId, invitation: updatedInvitation });
  } catch (err) {
    console.error('Error accepting match invitation:', err);
    return serverError('Failed to accept match invitation');
  }
};
