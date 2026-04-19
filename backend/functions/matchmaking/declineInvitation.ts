import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import {
  badRequest,
  notFound,
  forbidden,
  serverError,
  noContent,
} from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { createNotification } from '../../lib/notifications';

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

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can decline match invitations');
    }

    const { roster: { players }, leagueOps: { matchmaking } } = getRepositories();

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
      return forbidden('You cannot decline an invitation that is not addressed to you');
    }

    if (invitation.status !== 'pending') {
      return badRequest('Only pending invitations can be declined');
    }

    const now = new Date().toISOString();

    try {
      await matchmaking.updateInvitation(
        invitationId,
        {
          status: 'declined',
          updatedAt: now,
        },
        'pending',
      );
    } catch (err: unknown) {
      if (isConditionalCheckFailed(err)) {
        return badRequest('Only pending invitations can be declined');
      }
      throw err;
    }

    // Look up the inviter to notify them
    const inviter = await players.findById(invitation.fromPlayerId);
    const inviterRecord = inviter as unknown as Record<string, unknown> | null;
    if (inviterRecord?.userId) {
      await createNotification({
        userId: inviterRecord.userId as string,
        type: 'match_invitation_declined',
        message: `${callerPlayer.name} declined your match invitation.`,
        sourceId: invitationId,
        sourceType: 'match_invitation',
      });
    }

    return noContent();
  } catch (err) {
    console.error('Error declining match invitation:', err);
    return serverError('Failed to decline match invitation');
  }
};
