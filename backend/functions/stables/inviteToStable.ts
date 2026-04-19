import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { created, badRequest, notFound, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { createNotification } from '../../lib/notifications';

interface InviteBody {
  playerId: string;
  message?: string;
}

const MAX_STABLE_MEMBERS = 6;

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Only wrestlers can invite to stables');
    }

    const stableId = event.pathParameters?.stableId;
    if (!stableId) {
      return badRequest('stableId is required');
    }

    const { data: body, error: parseError } = parseBody<InviteBody>(event);
    if (parseError) return parseError;

    const { playerId, message } = body;

    if (!playerId) {
      return badRequest('playerId is required');
    }

    const { roster: { stables: stablesRepo, players: playersRepo } } = getRepositories();

    // Get stable
    const stable = await stablesRepo.findById(stableId);
    if (!stable) {
      return notFound('Stable not found');
    }

    // Verify caller is the stable leader
    const callerPlayer = await playersRepo.findByUserId(auth.sub);
    if (!callerPlayer || callerPlayer.playerId !== stable.leaderId) {
      return badRequest('Only the stable leader can invite members');
    }

    // Verify stable status
    if (stable.status !== 'approved' && stable.status !== 'active') {
      return badRequest('Can only invite members to approved or active stables');
    }

    // Verify stable has room
    if (stable.memberIds.length >= MAX_STABLE_MEMBERS) {
      return badRequest(`Stable already has the maximum of ${MAX_STABLE_MEMBERS} members`);
    }

    // Verify invited player exists and has no stable
    const invitedPlayer = await playersRepo.findById(playerId);
    if (!invitedPlayer) {
      return notFound('Invited player not found');
    }

    if (invitedPlayer.stableId) {
      return badRequest('Player already belongs to a stable');
    }

    // Check for existing pending invitation for this player+stable
    const existingInvitations = await stablesRepo.listInvitationsByStable(stableId);
    const hasPendingInvitation = existingInvitations.some(
      (inv) => inv.invitedPlayerId === playerId && inv.status === 'pending'
    );

    if (hasPendingInvitation) {
      return badRequest('A pending invitation already exists for this player');
    }

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await stablesRepo.createInvitation({
      stableId,
      invitedPlayerId: playerId,
      invitedByPlayerId: stable.leaderId,
      message: message || undefined,
      expiresAt: expiresAt.toISOString(),
    });

    // Notify the invited player
    if (invitedPlayer.userId) {
      await createNotification({
        userId: invitedPlayer.userId,
        type: 'stable_invitation',
        message: `You've been invited to join ${stable.name}`,
        sourceId: invitation.invitationId,
        sourceType: 'stable',
      });
    }

    return created(invitation);
  } catch (err) {
    console.error('Error inviting to stable:', err);
    return serverError('Failed to send invitation');
  }
};
