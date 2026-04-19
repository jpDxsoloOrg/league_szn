import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

interface RespondBody {
  action: 'accept' | 'decline';
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Only wrestlers can respond to invitations');
    }

    const stableId = event.pathParameters?.stableId;
    const invitationId = event.pathParameters?.invitationId;
    if (!stableId || !invitationId) {
      return badRequest('stableId and invitationId are required');
    }

    const { data: body, error: parseError } = parseBody<RespondBody>(event);
    if (parseError) return parseError;

    const { action } = body;

    if (action !== 'accept' && action !== 'decline') {
      return badRequest('action must be "accept" or "decline"');
    }

    const { stables: stablesRepo, players: playersRepo } = getRepositories();

    // Get invitation
    const invitation = await stablesRepo.findInvitationById(invitationId);
    if (!invitation) {
      return notFound('Invitation not found');
    }

    if (invitation.status !== 'pending') {
      return badRequest(`Invitation is already ${invitation.status}`);
    }

    if (invitation.stableId !== stableId) {
      return badRequest('Invitation does not belong to this stable');
    }

    // Verify caller is the invited player
    const callerPlayer = await playersRepo.findByUserId(auth.sub);
    if (!callerPlayer || callerPlayer.playerId !== invitation.invitedPlayerId) {
      return badRequest('You can only respond to your own invitations');
    }

    if (action === 'decline') {
      await stablesRepo.updateInvitation(invitationId, { status: 'declined' });
      return success({ message: 'Invitation declined', invitationId });
    }

    // action === 'accept'
    // Verify player doesn't already belong to a stable
    if (callerPlayer.stableId) {
      return badRequest('You already belong to a stable');
    }

    // Set the player's stableId
    await playersRepo.update(invitation.invitedPlayerId, { stableId });

    // Get stable to update memberIds
    const stable = await stablesRepo.findById(stableId);
    if (!stable) {
      return notFound('Stable not found');
    }

    const updatedMemberIds = [...stable.memberIds, invitation.invitedPlayerId];

    // Determine new status: if approved and now >= 2 members, set to active
    const newStatus =
      stable.status === 'approved' && updatedMemberIds.length >= 2
        ? 'active'
        : stable.status;

    await stablesRepo.update(stableId, {
      memberIds: updatedMemberIds,
      status: newStatus,
    });

    // Update invitation status
    await stablesRepo.updateInvitation(invitationId, { status: 'accepted' });

    return success({
      message: 'Invitation accepted',
      invitationId,
      stableId,
      newStatus,
    });
  } catch (err) {
    console.error('Error responding to invitation:', err);
    return serverError('Failed to respond to invitation');
  }
};
