import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
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
import type { InvitationRecord } from '../../lib/repositories/MatchmakingRepository';

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

    const { players, matchmaking } = getRepositories();

    // Find the caller's player record via their user sub
    const callerPlayer = await players.findByUserId(auth.sub);
    if (!callerPlayer) {
      return badRequest('No player profile linked to your account');
    }

    const invitationId = event.pathParameters?.invitationId;
    if (!invitationId) {
      return badRequest('invitationId is required');
    }

    const invitation = await matchmaking.getInvitation(invitationId);
    if (!invitation) {
      return notFound('Match invitation not found');
    }

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
    let updatedInvitation: InvitationRecord;
    try {
      updatedInvitation = await matchmaking.updateInvitation(
        invitationId,
        {
          status: 'accepted',
          acceptedAt: nowIso,
          updatedAt: nowIso,
        },
        'pending',
      );
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
    const [fromPlayer, toPlayer] = await Promise.all([
      players.findById(invitation.fromPlayerId),
      players.findById(invitation.toPlayerId),
    ]);

    const fromRecord = fromPlayer as unknown as PlayerRecord | undefined;
    const toRecord = toPlayer as unknown as PlayerRecord | undefined;

    const notifications: CreateNotificationParams[] = [];
    if (fromRecord?.userId) {
      notifications.push({
        userId: fromRecord.userId,
        type: 'match_scheduled',
        message: `Match scheduled with ${displayName(toRecord)}`,
        sourceId: matchId,
        sourceType: 'match',
      });
    }
    if (toRecord?.userId) {
      notifications.push({
        userId: toRecord.userId,
        type: 'match_scheduled',
        message: `Match scheduled with ${displayName(fromRecord)}`,
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
          await matchmaking.deleteQueue(pid);
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
