import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError, forbidden } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    const isAdmin = hasRole(auth, 'Admin');

    const challengeId = event.pathParameters?.challengeId;
    if (!challengeId) {
      return badRequest('challengeId is required');
    }

    const { challenges, players, tagTeams } = getRepositories();

    const challenge = await challenges.findById(challengeId);
    if (!challenge) {
      return notFound('Challenge not found');
    }

    const adminCancellableStatuses = ['pending', 'countered', 'accepted'];
    if (isAdmin && !adminCancellableStatuses.includes(challenge.status)) {
      return badRequest('Only pending, countered, or accepted challenges can be cancelled by admin');
    }
    if (!isAdmin && challenge.status !== 'pending') {
      return badRequest('Only pending challenges can be cancelled');
    }

    // Verify the canceller is the challenger (or admin)
    if (!isAdmin) {
      const player = await players.findByUserId(auth.sub);
      if (!player) {
        return forbidden('Player not found for current user');
      }

      if (challenge.challengeMode === 'tag_team') {
        const tagTeam = challenge.challengerTagTeamId
          ? await tagTeams.findById(challenge.challengerTagTeamId)
          : null;
        if (!tagTeam || (player.playerId !== tagTeam.player1Id && player.playerId !== tagTeam.player2Id)) {
          return forbidden('Only members of the challenger tag team or an admin can cancel');
        }
      } else if (player.playerId !== challenge.challengerId) {
        return forbidden('Only the challenger or an admin can cancel a challenge');
      }
    }

    const now = new Date().toISOString();

    const updated = await challenges.update(challengeId, {
      status: 'cancelled',
      updatedAt: now,
    });

    return success(updated);
  } catch (err) {
    console.error('Error cancelling challenge:', err);
    return serverError('Failed to cancel challenge');
  }
};
